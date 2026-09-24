import AVFoundation
import Capacitor
import VideoToolbox

/// The iOS app's video engine: builds the loop with AVFoundation, on the
/// phone's hardware decoder/encoder, instead of ffmpeg.wasm in the webview.
///
/// Three steps, none of which ever holds the whole clip in memory:
///  1. The trimmed segment is written out backwards (`reversed.mov`), a few
///     frames at a time, read chunk by chunk from the end of the segment.
///  2. An AVComposition strings the mode's legs together — forward legs cut
///     from the original, backward legs from the reversed copy, speed and
///     holds as time scaling, repeated for every loop. Nothing is decoded yet.
///  3. That composition is rendered once into the final HEVC file at the
///     source's own frame rate, colour (HDR stays HDR) and — for "Original" —
///     resolution.
@objc(LoopEnginePlugin)
public class LoopEnginePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LoopEnginePlugin"
    public let jsName = "LoopEngine"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preview", returnType: CAPPluginReturnPromise),
    ]

    private var workDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("loops", isDirectory: true)
    }

    override public func load() {
        try? FileManager.default.removeItem(at: workDirectory)
    }

    /// Renders the finished loop. Progress arrives as "progress" events.
    @objc func create(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let start = call.getDouble("start"),
              let duration = call.getDouble("duration"),
              let mode = call.getString("mode").flatMap(LoopMode.init(rawValue:)) else {
            call.reject("Missing or invalid options.")
            return
        }
        let request = LoopRequest(
            source: URL(fileURLWithPath: path),
            start: start,
            duration: duration,
            mode: mode,
            speed: call.getDouble("speed") ?? 1,
            loops: max(1, call.getInt("loops") ?? 1),
            shortSide: call.getInt("shortSide")
        )
        run(call, output: "loop.mp4") { engine, output in
            try await engine.renderLoop(request, to: output) { [weak self] fraction in
                self?.notifyListeners("progress", data: ["fraction": fraction])
            }
        }
    }

    /// A small copy of the trimmed segment where every frame is a keyframe, so
    /// the live preview can seek anywhere in it instantly.
    @objc func preview(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let start = call.getDouble("start"),
              let duration = call.getDouble("duration") else {
            call.reject("Missing or invalid options.")
            return
        }
        run(call, output: "preview-\(UUID().uuidString).mp4") { engine, output in
            try await engine.renderPreview(source: URL(fileURLWithPath: path), start: start, duration: duration, to: output)
        }
    }

    private func run(_ call: CAPPluginCall, output name: String, _ work: @escaping (LoopEngine, URL) async throws -> Void) {
        let directory = workDirectory
        Task.detached(priority: .userInitiated) {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let output = directory.appendingPathComponent(name)
                try? FileManager.default.removeItem(at: output)
                try await work(LoopEngine(workDirectory: directory), output)
                guard let webPath = self.bridge?.portablePath(fromLocalURL: output)?.absoluteString else {
                    throw LoopError.failed("No web path for the output.")
                }
                call.resolve(["uri": output.absoluteString, "path": output.path, "webPath": webPath])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}

enum LoopMode: String {
    case classic, ease, freeze, pulse, zoom
}

struct LoopRequest {
    let source: URL
    let start: Double
    let duration: Double
    let mode: LoopMode
    let speed: Double
    let loops: Int
    /// The output's short side in pixels, or nil to keep the source's.
    let shortSide: Int?
}

enum LoopError: LocalizedError {
    case failed(String)
    var errorDescription: String? {
        if case .failed(let message) = self { return message }
        return nil
    }
}

// These must match src/lib/boomerangMath.ts — the live preview in the
// webview, the duration readout and this export all follow the same curve.
private let easeZones: [(from: Double, to: Double, factor: Double)] = [
    (0, 0.3, 0.55),
    (0.3, 0.7, 1.9),
    (0.7, 1, 0.55),
]
private let freezeHoldSeconds = 0.35
private let pulsePullback = 0.55
private let zoomFactor: CGFloat = 1.15

/// Everything about the source track the engine needs, loaded once.
private struct SourceInfo {
    let asset: AVURLAsset
    let track: AVAssetTrack
    let naturalSize: CGSize
    let transform: CGAffineTransform
    let frameRate: Double
    let isHDR: Bool
    let colorPrimaries: String
    let transferFunction: String
    let yCbCrMatrix: String

    static func load(_ url: URL) async throws -> SourceInfo {
        let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw LoopError.failed("The file has no video track.")
        }
        let (naturalSize, transform, nominalFrameRate, formats, characteristics) = try await track.load(
            .naturalSize, .preferredTransform, .nominalFrameRate, .formatDescriptions, .mediaCharacteristics)
        let extensions = formats.first.flatMap { CMFormatDescriptionGetExtensions($0) as? [String: Any] } ?? [:]
        let string = { (key: CFString, fallback: String) in extensions[key as String] as? String ?? fallback }
        return SourceInfo(
            asset: asset,
            track: track,
            naturalSize: naturalSize,
            transform: transform,
            frameRate: Double(nominalFrameRate > 0 ? nominalFrameRate : 30),
            isHDR: characteristics.contains(.containsHDRVideo),
            colorPrimaries: string(kCMFormatDescriptionExtension_ColorPrimaries, AVVideoColorPrimaries_ITU_R_709_2),
            transferFunction: string(kCMFormatDescriptionExtension_TransferFunction, AVVideoTransferFunction_ITU_R_709_2),
            yCbCrMatrix: string(kCMFormatDescriptionExtension_YCbCrMatrix, AVVideoYCbCrMatrix_ITU_R_709_2)
        )
    }

    /// The picture's size once upright (a portrait iPhone video is stored
    /// landscape with a rotation).
    var orientedSize: CGSize {
        let rect = CGRect(origin: .zero, size: naturalSize).applying(transform)
        return CGSize(width: abs(rect.width), height: abs(rect.height))
    }

    /// Output frame rate: the source's, but a 120/240 fps slow-motion clip is
    /// played back at 60 like everything else.
    var outputFrameRate: Int32 { Int32(min(60, max(24, frameRate.rounded()))) }

    var colorProperties: [String: Any] {
        [
            AVVideoColorPrimariesKey: colorPrimaries,
            AVVideoTransferFunctionKey: transferFunction,
            AVVideoYCbCrMatrixKey: yCbCrMatrix,
        ]
    }

    /// 10-bit buffers for HDR so nothing is lost on the way through.
    var pixelFormat: OSType {
        isHDR ? kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    }
}

private let timescale: CMTimeScale = 60000

private func time(_ seconds: Double) -> CMTime {
    CMTime(seconds: seconds, preferredTimescale: timescale)
}

final class LoopEngine {
    private let workDirectory: URL

    init(workDirectory: URL) {
        self.workDirectory = workDirectory
    }

    func renderLoop(_ request: LoopRequest, to output: URL, progress: @escaping (Double) -> Void) async throws {
        let source = try await SourceInfo.load(request.source)
        let reversedURL = workDirectory.appendingPathComponent("reversed-\(UUID().uuidString).mov")
        defer { try? FileManager.default.removeItem(at: reversedURL) }

        // The reverse pass only has to decode and encode the short segment;
        // the final render encodes the whole (looped) output. Weighted roughly
        // by how many frames each one pushes through the encoder.
        let reverseWeight = 0.3
        let segment = CMTimeRange(start: time(request.start), duration: time(request.duration))
        let lastFrame = try await writeReversed(source, segment: segment, to: reversedURL) { progress($0 * reverseWeight) }

        let reversedAsset = AVURLAsset(url: reversedURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        guard let reversedTrack = try await reversedAsset.loadTracks(withMediaType: .video).first else {
            throw LoopError.failed("The reversed copy has no video track.")
        }

        let builder = try LoopComposition(
            source: source,
            reversedTrack: reversedTrack,
            request: request,
            lastFrameTime: lastFrame
        )
        let renderSize = Self.renderSize(source.orientedSize, shortSide: request.shortSide)
        try await render(
            builder.composition,
            track: builder.track,
            source: source,
            renderSize: renderSize,
            zoomRanges: builder.zoomRanges,
            to: output,
            codec: .hevc,
            keyframeEveryFrame: false
        ) { progress(reverseWeight + $0 * (1 - reverseWeight)) }
        progress(1)
    }

    func renderPreview(source url: URL, start: Double, duration: Double, to output: URL) async throws {
        let source = try await SourceInfo.load(url)
        let composition = AVMutableComposition()
        guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw LoopError.failed("Couldn't create the preview.")
        }
        try track.insertTimeRange(CMTimeRange(start: time(start), duration: time(duration)), of: source.track, at: .zero)
        try await render(
            composition,
            track: track,
            source: source,
            renderSize: Self.renderSize(source.orientedSize, shortSide: 360),
            zoomRanges: [],
            to: output,
            codec: .h264,
            keyframeEveryFrame: true
        ) { _ in }
    }

    /// Downscales (never upscales) so the short side is `shortSide`, keeping
    /// both sides even as encoders require.
    static func renderSize(_ size: CGSize, shortSide: Int?) -> CGSize {
        let short = min(size.width, size.height)
        let scale = shortSide.map { min(1, CGFloat($0) / short) } ?? 1
        let even = { (value: CGFloat) in CGFloat(max(2, Int((value * scale / 2).rounded()) * 2)) }
        return CGSize(width: even(size.width), height: even(size.height))
    }

    // MARK: - Reverse pass

    /// Writes `segment` backwards into `url`: the segment's last frame lands at
    /// time 0, and a source frame at time t lands at (lastFrame - t). Returns
    /// lastFrame, which is what maps source times onto the reversed copy.
    ///
    /// Frames are read in chunks from the end of the segment towards its
    /// start, each chunk held only until it has been written out in reverse,
    /// so memory stays at a few frames however long or large the clip is.
    private func writeReversed(_ source: SourceInfo, segment: CMTimeRange, to url: URL, progress: (Double) -> Void) async throws -> CMTime {
        let bytesPerFrame = source.naturalSize.width * source.naturalSize.height * 1.5 * (source.isHDR ? 2 : 1)
        let framesPerChunk = max(4, Int(300_000_000 / bytesPerFrame))
        let chunkDuration = time(Double(framesPerChunk) / source.frameRate)

        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: Self.writerSettings(
            size: source.naturalSize,
            source: source,
            codec: .hevc,
            // An intermediate that gets decoded and encoded again, so it's
            // kept well above the final file's bitrate.
            bitsPerPixel: 0.4,
            keyframeEveryFrame: false
        ))
        input.transform = source.transform
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? LoopError.failed("Couldn't start the reverse pass.") }
        writer.startSession(atSourceTime: .zero)

        var lastFrame: CMTime?
        var chunkEnd = segment.end
        while chunkEnd > segment.start {
            try Task.checkCancellation()
            let chunkStart = max(segment.start, chunkEnd - chunkDuration)
            let frames = try Self.readFrames(source, in: CMTimeRange(start: chunkStart, end: chunkEnd))
            if lastFrame == nil { lastFrame = frames.last?.time }
            for frame in frames.reversed() {
                while !input.isReadyForMoreMediaData {
                    try await Task.sleep(nanoseconds: 2_000_000)
                }
                guard let lastFrame, adaptor.append(frame.buffer, withPresentationTime: lastFrame - frame.time) else {
                    throw writer.error ?? LoopError.failed("Couldn't write the reverse pass.")
                }
            }
            chunkEnd = chunkStart
            progress((segment.end - chunkEnd).seconds / segment.duration.seconds)
        }

        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed, let lastFrame else {
            throw writer.error ?? LoopError.failed("The segment has no frames.")
        }
        return lastFrame
    }

    private struct Frame {
        let time: CMTime
        let buffer: CVPixelBuffer
    }

    /// Every decoded frame whose timestamp falls inside `range`, in order.
    private static func readFrames(_ source: SourceInfo, in range: CMTimeRange) throws -> [Frame] {
        let reader = try AVAssetReader(asset: source.asset)
        reader.timeRange = range
        let output = AVAssetReaderTrackOutput(track: source.track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: source.pixelFormat,
        ])
        output.alwaysCopiesSampleData = false
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? LoopError.failed("Couldn't read the video.") }
        var frames: [Frame] = []
        while let sample = output.copyNextSampleBuffer() {
            let time = CMSampleBufferGetPresentationTimeStamp(sample)
            // A reader can hand back a frame just outside its range; the
            // neighbouring chunk owns that one.
            guard time >= range.start, time < range.end, let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
            frames.append(Frame(time: time, buffer: buffer))
        }
        if reader.status == .failed { throw reader.error ?? LoopError.failed("Couldn't read the video.") }
        return frames
    }

    // MARK: - Final render

    enum Codec { case hevc, h264 }

    private func render(
        _ composition: AVComposition,
        track: AVCompositionTrack,
        source: SourceInfo,
        renderSize: CGSize,
        zoomRanges: [CMTimeRange],
        to url: URL,
        codec: Codec,
        keyframeEveryFrame: Bool,
        progress: @escaping (Double) -> Void
    ) async throws {
        let oriented = source.orientedSize
        let base = source.transform.concatenating(CGAffineTransform(
            scaleX: renderSize.width / oriented.width,
            y: renderSize.height / oriented.height
        ))
        let zoomed = base
            .concatenating(CGAffineTransform(translationX: -renderSize.width / 2, y: -renderSize.height / 2))
            .concatenating(CGAffineTransform(scaleX: zoomFactor, y: zoomFactor))
            .concatenating(CGAffineTransform(translationX: renderSize.width / 2, y: renderSize.height / 2))

        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        layer.setTransform(base, at: .zero)
        for range in zoomRanges {
            layer.setTransform(zoomed, at: range.start)
            layer.setTransform(base, at: range.end)
        }
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
        instruction.layerInstructions = [layer]

        // A preview is plain SDR H.264 for the webview; the real render keeps
        // the source's colour as it is.
        let keepsColor = codec == .hevc
        let videoComposition = AVMutableVideoComposition()
        videoComposition.instructions = [instruction]
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: source.outputFrameRate)
        videoComposition.colorPrimaries = keepsColor ? source.colorPrimaries : AVVideoColorPrimaries_ITU_R_709_2
        videoComposition.colorTransferFunction = keepsColor ? source.transferFunction : AVVideoTransferFunction_ITU_R_709_2
        videoComposition.colorYCbCrMatrix = keepsColor ? source.yCbCrMatrix : AVVideoYCbCrMatrix_ITU_R_709_2

        let reader = try AVAssetReader(asset: composition)
        let output = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: keepsColor ? source.pixelFormat : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        ])
        output.videoComposition = videoComposition
        output.alwaysCopiesSampleData = false
        reader.add(output)

        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: Self.writerSettings(
            size: renderSize,
            source: source,
            codec: codec,
            bitsPerPixel: codec == .hevc ? 0.1 : 0.08,
            keyframeEveryFrame: keyframeEveryFrame,
            keepsColor: keepsColor
        ))
        input.expectsMediaDataInRealTime = false
        writer.add(input)

        guard reader.startReading() else { throw reader.error ?? LoopError.failed("Couldn't read the composition.") }
        guard writer.startWriting() else { throw writer.error ?? LoopError.failed("Couldn't start the export.") }
        writer.startSession(atSourceTime: .zero)

        let total = composition.duration.seconds
        while let sample = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 2_000_000)
            }
            guard input.append(sample) else { throw writer.error ?? LoopError.failed("Couldn't write the video.") }
            if total > 0 { progress(min(1, CMSampleBufferGetPresentationTimeStamp(sample).seconds / total)) }
        }
        if reader.status == .failed {
            writer.cancelWriting()
            throw reader.error ?? LoopError.failed("Couldn't read the composition.")
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? LoopError.failed("Couldn't finish the export.") }
    }

    private static func writerSettings(
        size: CGSize,
        source: SourceInfo,
        codec: Codec,
        bitsPerPixel: Double,
        keyframeEveryFrame: Bool,
        keepsColor: Bool = true
    ) -> [String: Any] {
        let fps = Double(source.outputFrameRate)
        // Roughly what the iPhone camera itself uses: ~50 Mbps for 4K60 HEVC.
        let bitrate = max(2_000_000, Double(size.width * size.height) * fps * bitsPerPixel)
        var compression: [String: Any] = [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoExpectedSourceFrameRateKey: fps,
            AVVideoAllowFrameReorderingKey: !keyframeEveryFrame,
        ]
        if keyframeEveryFrame { compression[AVVideoMaxKeyFrameIntervalKey] = 1 }
        switch codec {
        case .hevc:
            compression[AVVideoProfileLevelKey] = source.isHDR && keepsColor
                ? kVTProfileLevel_HEVC_Main10_AutoLevel as String
                : kVTProfileLevel_HEVC_Main_AutoLevel as String
        case .h264:
            compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        }
        var settings: [String: Any] = [
            AVVideoCodecKey: codec == .hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
            AVVideoWidthKey: size.width,
            AVVideoHeightKey: size.height,
            AVVideoCompressionPropertiesKey: compression,
        ]
        settings[AVVideoColorPropertiesKey] = keepsColor ? source.colorProperties : [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ]
        return settings
    }
}

/// Lays a mode's legs end to end on one composition track, `loops` times.
/// Only time ranges are arranged here — no frame is decoded until the render.
private struct LoopComposition {
    let composition = AVMutableComposition()
    let track: AVMutableCompositionTrack
    private(set) var zoomRanges: [CMTimeRange] = []

    private let source: SourceInfo
    private let reversedTrack: AVAssetTrack
    private let request: LoopRequest
    private let lastFrameTime: CMTime
    private let frameDuration: CMTime
    private var cursor = CMTime.zero

    init(source: SourceInfo, reversedTrack: AVAssetTrack, request: LoopRequest, lastFrameTime: CMTime) throws {
        guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw LoopError.failed("Couldn't create the composition.")
        }
        self.track = track
        self.source = source
        self.reversedTrack = reversedTrack
        self.request = request
        self.lastFrameTime = lastFrameTime
        self.frameDuration = time(1 / source.frameRate)
        track.preferredTransform = .identity

        for _ in 0..<request.loops {
            try addLoop()
        }
    }

    private mutating func addLoop() throws {
        let speed = request.mode == .classic ? request.speed : 1
        switch request.mode {
        case .classic, .zoom:
            try forward(0, 1, rate: speed)
            let zoomStart = cursor
            try backward(1, 0, rate: speed)
            if request.mode == .zoom { zoomRanges.append(CMTimeRange(start: zoomStart, end: cursor)) }
        case .ease:
            for zone in easeZones { try forward(zone.from, zone.to, rate: zone.factor) }
            for zone in easeZones.reversed() { try backward(zone.to, zone.from, rate: zone.factor) }
        case .freeze:
            try forward(0, 1, rate: 1)
            try hold(atEnd: true)
            try backward(1, 0, rate: 1)
            try hold(atEnd: false)
        case .pulse:
            try forward(0, 1, rate: 1)
            try backward(1, pulsePullback, rate: 1)
            try forward(pulsePullback, 1, rate: 1)
            try backward(1, 0, rate: 1)
        }
    }

    private func sourceTime(_ fraction: Double) -> CMTime {
        time(request.start + fraction * request.duration)
    }

    /// Source fractions `from` → `to`, played forwards from the original.
    private mutating func forward(_ from: Double, _ to: Double, rate: Double) throws {
        try insert(CMTimeRange(start: sourceTime(from), end: sourceTime(to)), of: source.track, rate: rate)
    }

    /// Source fractions `from` → `to` (from > to), played backwards from the
    /// reversed copy, where source time t sits at lastFrameTime - t.
    private mutating func backward(_ from: Double, _ to: Double, rate: Double) throws {
        let start = CMTimeMaximum(.zero, lastFrameTime - sourceTime(from))
        let end = CMTimeMaximum(start, lastFrameTime - sourceTime(to) + frameDuration)
        try insert(CMTimeRange(start: start, end: end), of: reversedTrack, rate: rate)
    }

    /// Holds one frame (the segment's last or first) for freezeHoldSeconds.
    private mutating func hold(atEnd: Bool) throws {
        let frame = atEnd
            ? CMTimeRange(start: CMTimeMaximum(.zero, lastFrameTime), duration: frameDuration)
            : CMTimeRange(start: time(request.start), duration: frameDuration)
        try insert(frame, of: source.track, rate: frameDuration.seconds / freezeHoldSeconds)
    }

    private mutating func insert(_ range: CMTimeRange, of track: AVAssetTrack, rate: Double) throws {
        guard range.duration > .zero else { return }
        try self.track.insertTimeRange(range, of: track, at: cursor)
        let played = time(range.duration.seconds / rate)
        if played != range.duration {
            self.track.scaleTimeRange(CMTimeRange(start: cursor, duration: range.duration), toDuration: played)
        }
        cursor = cursor + played
    }
}
