import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// The system video picker (PHPicker). It runs out of process, so it needs no
/// photo library permission, and it shows only videos.
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
            configuration.filter = .videos
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
        guard let type = registered.first(where: { $0.conforms(to: .movie) }) else { return nil }
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
}
