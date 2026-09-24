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

    /// The same loop, made from a file that already holds just the segment.
    func startingAtZero(from url: URL) -> LoopRequest {
        LoopRequest(source: url, start: 0, duration: duration, mode: mode, speed: speed, loops: loops, shortSide: shortSide)
    }
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

    /// The rotation that turns a stored frame upright, moved so the picture
    /// lands at (0, 0). iPhone videos already carry that offset, but a file
    /// from elsewhere may hold the bare rotation, which would draw the whole
    /// picture outside the frame — a black video.
    var uprightTransform: CGAffineTransform {
        let rect = CGRect(origin: .zero, size: naturalSize).applying(transform)
        return transform.concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
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

    func renderLoop(_ original: LoopRequest, to output: URL, progress: @escaping (Double) -> Void) async throws {
        var source = try await SourceInfo.load(original.source)
        var request = original
        let reversedURL = workDirectory.appendingPathComponent("reversed-\(UUID().uuidString).mov")
        let denseURL = workDirectory.appendingPathComponent("dense-\(UUID().uuidString).mov")
        defer {
            try? FileManager.default.removeItem(at: reversedURL)
            try? FileManager.default.removeItem(at: denseURL)
        }

        // Slow motion: stretching a 30 or 60 fps clip only repeats its frames
        // (0.5x of 60 fps is 30 real frames a second — the choppiness the
        // web version could only paper over with crossfades). Where the phone
        // can, the segment is first rebuilt with the missing in-between frames
        // synthesised by Apple's frame interpolation, then used in place of
        // the original from here on.
        var interpolateWeight = 0.0
        #if !targetEnvironment(simulator)
        let factor = Self.interpolationFactor(source, request)
        if factor > 1, #available(iOS 26.0, *) {
            let segment = CMTimeRange(start: time(request.start), duration: time(request.duration))
            if try await writeInterpolated(source, segment: segment, factor: factor, to: denseURL, progress: { progress($0 * 0.35) }) {
                CAPLog.print("LoopEngine: slow motion interpolated \(factor)x")
                source = try await SourceInfo.load(denseURL)
                request = request.startingAtZero(from: denseURL)
                interpolateWeight = 0.35
            }
        }
        #endif

        // The reverse pass only has to decode and encode the short segment;
        // the final render encodes the whole (looped) output. Weighted roughly
        // by how many frames each one pushes through the encoder.
        let reverseEnd = interpolateWeight + (1 - interpolateWeight) * 0.3
        let segment = CMTimeRange(start: time(request.start), duration: time(request.duration))
        let lastFrame = try await writeReversed(source, segment: segment, to: reversedURL) {
            progress(interpolateWeight + $0 * (reverseEnd - interpolateWeight))
        }

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
        ) { progress(reverseEnd + $0 * (1 - reverseEnd)) }
        progress(1)
    }

    /// How many frames per source frame the segment needs so that its slowest
    /// part still plays at 60 real frames a second — 1 when nothing is slowed.
    private static func interpolationFactor(_ source: SourceInfo, _ request: LoopRequest) -> Int {
        let slowest: Double
        switch request.mode {
        case .classic: slowest = request.speed
        case .ease: slowest = easeZones.map(\.factor).min() ?? 1
        case .freeze, .pulse, .zoom: slowest = 1
        }
        guard slowest < 1 else { return 1 }
        return min(8, max(2, Int((60 / (source.frameRate * slowest)).rounded(.up))))
    }

    // MARK: - Frame interpolation

    // Frame interpolation runs on the phone's neural engine; the simulator
    // has none, so there it's left out and slow motion repeats frames.
    #if !targetEnvironment(simulator)

    /// Writes `segment` with `factor - 1` synthesised frames between every
    /// pair of real ones (same timing, `factor` times the frame rate), starting
    /// at time 0. Returns false — writing nothing — where the phone can't do
    /// it (iOS 26's frame interpolation needs a recent chip), so the caller
    /// carries on with the original frames.
    @available(iOS 26.0, *)
    private func writeInterpolated(_ source: SourceInfo, segment: CMTimeRange, factor: Int, to url: URL, progress: (Double) -> Void) async throws -> Bool {
        let width = Int(source.naturalSize.width), height = Int(source.naturalSize.height)
        guard VTFrameRateConversionConfiguration.isSupported,
              let configuration = VTFrameRateConversionConfiguration(
                  frameWidth: width,
                  frameHeight: height,
                  usePrecomputedFlow: false,
                  qualityPrioritization: .quality,
                  revision: VTFrameRateConversionConfiguration.defaultRevision),
              let processingFormat = configuration.supportedPixelFormats.first else {
            return false
        }

        // The interpolator works on RGBA (half float — HDR survives it), while
        // the video decodes to and encodes from YUV. Real frames go straight
        // through; each one is also converted to RGBA to interpolate from, and
        // the synthesised frames are converted back to the video's own YUV.
        func makePool(_ base: [String: Any], format: OSType) -> CVPixelBufferPool? {
            var attributes = base
            attributes[kCVPixelBufferPixelFormatTypeKey as String] = format
            attributes[kCVPixelBufferWidthKey as String] = width
            attributes[kCVPixelBufferHeightKey as String] = height
            attributes[kCVPixelBufferIOSurfacePropertiesKey as String] = attributes[kCVPixelBufferIOSurfacePropertiesKey as String] ?? [:]
            var pool: CVPixelBufferPool?
            CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &pool)
            return pool
        }
        guard let sourcePool = makePool(configuration.sourcePixelBufferAttributes, format: processingFormat),
              let destinationPool = makePool(configuration.destinationPixelBufferAttributes, format: processingFormat),
              let videoPool = makePool([:], format: source.pixelFormat) else { return false }
        var transferSession: VTPixelTransferSession?
        VTPixelTransferSessionCreate(allocator: nil, pixelTransferSessionOut: &transferSession)
        guard let transferSession else { return false }
        defer { VTPixelTransferSessionInvalidate(transferSession) }

        func convert(_ buffer: CVPixelBuffer, using pool: CVPixelBufferPool) throws -> CVPixelBuffer {
            var converted: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &converted)
            guard let converted, VTPixelTransferSessionTransferImage(transferSession, from: buffer, to: converted) == noErr else {
                throw LoopError.failed("Couldn't convert a frame for slow motion.")
            }
            return converted
        }

        let processor = VTFrameProcessor()
        try processor.startSession(configuration: configuration)
        defer { processor.endSession() }

        let reader = try AVAssetReader(asset: source.asset)
        reader.timeRange = segment
        let output = AVAssetReaderTrackOutput(track: source.track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: source.pixelFormat,
        ])
        output.alwaysCopiesSampleData = false
        reader.add(output)

        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: Self.writerSettings(
            size: source.naturalSize,
            source: source,
            codec: .hevc,
            bitsPerPixel: 0.4,
            keyframeEveryFrame: false
        ))
        input.transform = source.uprightTransform
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        writer.add(input)
        guard reader.startReading() else { throw reader.error ?? LoopError.failed("Couldn't read the video.") }
        guard writer.startWriting() else { throw writer.error ?? LoopError.failed("Couldn't start the slow-motion pass.") }
        writer.startSession(atSourceTime: .zero)

        func append(_ buffer: CVPixelBuffer, at time: CMTime) async throws {
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 2_000_000)
            }
            guard adaptor.append(buffer, withPresentationTime: time - segment.start) else {
                throw writer.error ?? LoopError.failed("Couldn't write the slow-motion pass.")
            }
        }

        let phases = (1..<factor).map { Float($0) / Float(factor) }
        var previous: (video: CVPixelBuffer, rgba: CVPixelBuffer, time: CMTime)?
        while let sample = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            let time = CMSampleBufferGetPresentationTimeStamp(sample)
            guard time >= segment.start, time < segment.end, let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
            let rgba = try convert(buffer, using: sourcePool)
            if let previous {
                try await append(previous.video, at: previous.time)
                let gap = time - previous.time
                var destinations: [(buffer: CVPixelBuffer, time: CMTime)] = []
                for phase in phases {
                    var destination: CVPixelBuffer?
                    CVPixelBufferPoolCreatePixelBuffer(nil, destinationPool, &destination)
                    guard let destination else { throw LoopError.failed("Out of memory for slow motion.") }
                    destinations.append((destination, previous.time + CMTimeMultiplyByFloat64(gap, multiplier: Float64(phase))))
                }
                guard let sourceFrame = VTFrameProcessorFrame(buffer: previous.rgba, presentationTimeStamp: previous.time),
                      let nextFrame = VTFrameProcessorFrame(buffer: rgba, presentationTimeStamp: time) else {
                    throw LoopError.failed("Couldn't prepare frames for slow motion.")
                }
                let destinationFrames = destinations.compactMap { VTFrameProcessorFrame(buffer: $0.buffer, presentationTimeStamp: $0.time) }
                guard destinationFrames.count == destinations.count,
                      let parameters = VTFrameRateConversionParameters(
                          sourceFrame: sourceFrame,
                          nextFrame: nextFrame,
                          opticalFlow: nil,
                          interpolationPhase: phases,
                          submissionMode: .sequential,
                          destinationFrames: destinationFrames) else {
                    throw LoopError.failed("Couldn't prepare frames for slow motion.")
                }
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    processor.process(parameters: parameters) { _, error in
                        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                    }
                }
                for destination in destinations {
                    CVBufferPropagateAttachments(previous.rgba, destination.buffer)
                    let video = try convert(destination.buffer, using: videoPool)
                    CVBufferPropagateAttachments(previous.video, video)
                    try await append(video, at: destination.time)
                }
            }
            CVBufferPropagateAttachments(buffer, rgba)
            previous = (buffer, rgba, time)
            progress((time - segment.start).seconds / segment.duration.seconds)
        }
        if let previous { try await append(previous.video, at: previous.time) }
        if reader.status == .failed { throw reader.error ?? LoopError.failed("Couldn't read the video.") }

        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? LoopError.failed("Couldn't finish the slow-motion pass.") }
        return true
    }
    #endif

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
        input.transform = source.uprightTransform
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
        let base = source.uprightTransform.concatenating(CGAffineTransform(
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
        // Without this the file ends where the last frame starts, so a loop
        // that finishes on a hold (freeze) would lose that whole hold.
        writer.endSession(atSourceTime: composition.duration)
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
        // Capped where the hardware encoder stops keeping up; only the
        // intermediate files at 4K ever get near it.
        let bitrate = min(160_000_000, max(2_000_000, Double(size.width * size.height) * fps * bitsPerPixel))
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
    private let reversedDuration: CMTime
    private let frameDuration: CMTime
    private var cursor = CMTime.zero
    /// +1 forward, -1 backward, 0 a hold; nil before the first leg.
    private var previousDirection: Int?

    init(source: SourceInfo, reversedTrack: AVAssetTrack, request: LoopRequest, lastFrameTime: CMTime) throws {
        guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw LoopError.failed("Couldn't create the composition.")
        }
        self.track = track
        self.source = source
        self.reversedTrack = reversedTrack
        self.request = request
        self.lastFrameTime = lastFrameTime
        self.reversedDuration = reversedTrack.timeRange.duration
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

    // Every leg is half-open, [from, to), so legs running the same way join
    // without repeating a frame. Where the motion turns around, the frame it
    // turns on already closed the previous leg, so the new leg starts one
    // frame later — otherwise every turn would hold for a frame, a visible
    // stutter at the peak and at the start of each loop.
    private mutating func turnOffset(_ direction: Int) -> CMTime {
        defer { previousDirection = direction }
        guard let previousDirection, previousDirection != direction else { return .zero }
        return frameDuration
    }

    /// Source fractions `from` → `to`, played forwards from the original.
    private mutating func forward(_ from: Double, _ to: Double, rate: Double) throws {
        let start = sourceTime(from) + turnOffset(1)
        try insert(CMTimeRange(start: start, end: CMTimeMaximum(start, sourceTime(to))), of: source.track, rate: rate)
    }

    /// Source fractions `from` → `to` (from > to), played backwards from the
    /// reversed copy, where source time t sits at lastFrameTime - t.
    private mutating func backward(_ from: Double, _ to: Double, rate: Double) throws {
        let start = CMTimeMaximum(.zero, lastFrameTime - sourceTime(from)) + turnOffset(-1)
        // Back at the very start, the segment's first frame is included.
        let end = to == 0 ? reversedDuration : lastFrameTime - sourceTime(to)
        try insert(CMTimeRange(start: start, end: CMTimeMaximum(start, CMTimeMinimum(end, reversedDuration))), of: reversedTrack, rate: rate)
    }

    /// Holds one frame (the segment's last or first) for freezeHoldSeconds.
    private mutating func hold(atEnd: Bool) throws {
        previousDirection = 0
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
