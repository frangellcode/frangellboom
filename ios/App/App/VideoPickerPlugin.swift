import AVFoundation
import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// The system video picker (PHPicker). It runs out of process, so it needs no
/// photo library permission, and it shows videos and Live Photos.
///
/// A Live Photo comes back as the short video inside it, made 9:16 for
/// Stories when it's an upright 3:4 shot (see `storyCrop`), and marked
/// `livePhoto` — turning one into a loop is part of Pro.
///
/// The video comes back as its ORIGINAL file — `.current` asks Photos for the
/// asset exactly as stored, so HEVC stays HEVC and nothing is re-compressed —
/// copied into the app's cache for the webview to read.
@objc(VideoPickerPlugin)
public class VideoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "VideoPickerPlugin"
    public let jsName = "VideoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?

    private var pickedDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("picked", isDirectory: true)
    }

    override public func load() {
        // A picked video is read from here for as long as it's being edited,
        // so the folder can only be cleared once nothing points at it: at launch.
        try? FileManager.default.removeItem(at: pickedDirectory)
    }

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var configuration = PHPickerConfiguration()
            configuration.selectionLimit = 1
            configuration.filter = .any(of: [.videos, .livePhotos])
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let result = results.first else {
            call.resolve([:])
            return
        }
        Task {
            try? FileManager.default.createDirectory(at: pickedDirectory, withIntermediateDirectories: true)
            if let video = await copyOriginal(of: result) {
                call.resolve(["video": video])
            } else {
                call.reject("The video couldn't be read.")
            }
        }
    }

    private func copyOriginal(of result: PHPickerResult) async -> [String: Any]? {
        let provider = result.itemProvider
        let registered = provider.registeredTypeIdentifiers.compactMap(UTType.init)
        guard let type = registered.first(where: { $0.conforms(to: .movie) }) else {
            return await copyLivePhotoVideo(of: provider)
        }
        let ext = type.preferredFilenameExtension ?? "mov"
        let destination = pickedDirectory.appendingPathComponent("\(UUID().uuidString).\(ext)")

        let copied: Bool = await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                // The provided file is deleted as soon as this handler returns.
                guard let url, (try? FileManager.default.copyItem(at: url, to: destination)) != nil else {
                    continuation.resume(returning: false)
                    return
                }
                continuation.resume(returning: true)
            }
        }
        guard copied else { return nil }

        let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? Int) ?? 0
        guard let webPath = bridge?.portablePath(fromLocalURL: destination)?.absoluteString else { return nil }
        return [
            "webPath": webPath,
            "path": destination.path,
            "name": "\(provider.suggestedName ?? "video").\(ext)",
            "mimeType": type.preferredMIMEType ?? "video/quicktime",
            "size": size,
        ]
    }

    // MARK: - Live Photos

    /// The video half of a Live Photo, copied out and made ready for Stories.
    private func copyLivePhotoVideo(of provider: NSItemProvider) async -> [String: Any]? {
        guard let movie = await livePhotoMovie(from: provider) else { return nil }
        defer { try? FileManager.default.removeItem(at: movie) }
        let destination = pickedDirectory.appendingPathComponent("\(UUID().uuidString).mov")
        do {
            try await Self.storyCrop(movie, to: destination)
        } catch {
            // Not a shape that needs it, or the crop failed: the video as it is.
            guard (try? FileManager.default.copyItem(at: movie, to: destination)) != nil else { return nil }
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? Int) ?? 0
        guard let webPath = bridge?.portablePath(fromLocalURL: destination)?.absoluteString else { return nil }
        return [
            "webPath": webPath,
            "path": destination.path,
            "name": "\(provider.suggestedName ?? "Live Photo").mov",
            "mimeType": "video/quicktime",
            "size": size,
            "livePhoto": true,
        ]
    }

    /// Finds the Live Photo's paired video: first in its file bundle (a folder
    /// holding the still and the .mov), then through Photos' own resources.
    /// The result is a private copy in the temporary folder.
    private func livePhotoMovie(from provider: NSItemProvider) async -> URL? {
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mov")
        let bundleType = "com.apple.live-photo-bundle"
        if provider.hasItemConformingToTypeIdentifier(bundleType) {
            let found: Bool = await withCheckedContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: bundleType) { url, _ in
                    // Like any provided file, the bundle is gone once this returns.
                    let contents = url.flatMap { try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) } ?? []
                    let movie = contents.first { UTType(filenameExtension: $0.pathExtension)?.conforms(to: .movie) == true }
                    continuation.resume(returning: movie.map { (try? FileManager.default.copyItem(at: $0, to: temporary)) != nil } ?? false)
                }
            }
            if found { return temporary }
        }
        guard provider.canLoadObject(ofClass: PHLivePhoto.self) else { return nil }
        let livePhoto: PHLivePhoto? = await withCheckedContinuation { continuation in
            provider.loadObject(ofClass: PHLivePhoto.self) { object, _ in
                continuation.resume(returning: object as? PHLivePhoto)
            }
        }
        guard let livePhoto,
              let resource = PHAssetResource.assetResources(for: livePhoto).first(where: { $0.type == .pairedVideo }) else { return nil }
        return await withCheckedContinuation { continuation in
            PHAssetResourceManager.default().writeData(for: resource, toFile: temporary, options: nil) { error in
                continuation.resume(returning: error == nil ? temporary : nil)
            }
        }
    }

    /// Live Photos are 3:4, Stories are 9:16: an upright one is cropped to
    /// 9:16 around its centre, at full height. Anything else (landscape, or
    /// already narrow) throws, and is used as it is.
    static func storyCrop(_ source: URL, to destination: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw CropError.notNeeded }
        let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
        let oriented = natural.applying(transform)
        let width = abs(oriented.width), height = abs(oriented.height)
        let storyWidth = (height * 9 / 16 / 2).rounded(.down) * 2
        guard height > width, storyWidth < width - 2 else { throw CropError.notNeeded }

        let composition = try await AVMutableVideoComposition.videoComposition(withPropertiesOf: asset)
        composition.renderSize = CGSize(width: storyWidth, height: height)
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        layer.setTransform(transform.concatenating(CGAffineTransform(translationX: -((width - storyWidth) / 2).rounded(), y: 0)), at: .zero)
        instruction.layerInstructions = [layer]
        composition.instructions = [instruction]

        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHEVCHighestQuality) else { throw CropError.failed }
        export.videoComposition = composition
        export.outputURL = destination
        export.outputFileType = .mov
        await withCheckedContinuation { continuation in
            export.exportAsynchronously { continuation.resume() }
        }
        guard export.status == .completed else {
            try? FileManager.default.removeItem(at: destination)
            throw CropError.failed
        }
    }

    enum CropError: Error {
        case notNeeded, failed
    }
}
