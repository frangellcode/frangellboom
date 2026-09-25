import AVFoundation
import Capacitor
import UIKit

/// Records a short clip straight into the editor, with the camera at its best:
/// the highest resolution and frame rate the phone offers (4K60 on recent
/// iPhones), HDR (HLG) where supported, and stabilisation. No audio — loops
/// are silent — so only camera permission is asked for.
///
/// One button, two gestures: hold it to record for as long as it's held, or
/// tap it to record until it's tapped again. Either way a clip stops itself at
/// `maxDuration`, a ring round the button showing how much is left.
@objc(CameraPlugin)
public class CameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CameraPlugin"
    public let jsName = "Camera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
    ]

    private var recordedDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("recorded", isDirectory: true)
    }

    override public func load() {
        try? FileManager.default.removeItem(at: recordedDirectory)
    }

    @objc func record(_ call: CAPPluginCall) {
        let maxDuration = call.getDouble("maxDuration") ?? 2
        let hint = call.getString("hint") ?? ""
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard granted else {
                    call.reject("Camera access is off.", "DENIED")
                    return
                }
                try? FileManager.default.createDirectory(at: self.recordedDirectory, withIntermediateDirectories: true)
                let output = self.recordedDirectory.appendingPathComponent("\(UUID().uuidString).mov")
                let camera = CameraViewController(output: output, maxDuration: maxDuration, hint: hint) { [weak self] url in
                    guard let self else { return }
                    guard let url,
                          let webPath = self.bridge?.portablePath(fromLocalURL: url)?.absoluteString else {
                        call.resolve([:])
                        return
                    }
                    call.resolve(["video": ["webPath": webPath, "path": url.path, "name": "Recording.mov"]])
                }
                camera.modalPresentationStyle = .fullScreen
                self.bridge?.viewController?.present(camera, animated: true)
            }
        }
    }
}

final class CameraViewController: UIViewController, AVCaptureFileOutputRecordingDelegate {
    private let output: URL
    private let maxDuration: Double
    private let hint: String
    private let completion: (URL?) -> Void

    private let session = AVCaptureSession()
    private let movieOutput = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "camera.session")
    private var position: AVCaptureDevice.Position = .back
    private var previewLayer: AVCaptureVideoPreviewLayer!

    private let recordButton = UIControl()
    private let ring = CAShapeLayer()
    private let dot = UIView()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let formatLabel = UILabel()
    private let hintLabel = UILabel()

    private var pressStarted: Date?
    private var recordingStarted: Date?
    private var tapMode = false
    private var stopping = false
    private var take = 0
    private var finished = false

    init(output: URL, maxDuration: Double, hint: String, completion: @escaping (URL?) -> Void) {
        self.output = output
        self.maxDuration = maxDuration
        self.hint = hint
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        buildControls()
        sessionQueue.async { self.configure(position: self.position) }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        sessionQueue.async { self.session.stopRunning() }
    }

    // MARK: - Session

    /// The best format the camera has for a short clip: most pixels, then the
    /// highest frame rate up to 60, then HDR.
    private func bestFormat(for device: AVCaptureDevice) -> (AVCaptureDevice.Format, Double, Bool)? {
        var best: (format: AVCaptureDevice.Format, score: Double, fps: Double, hdr: Bool)?
        for format in device.formats {
            let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            // Video formats only: 16:9, up to 4K (the 4:3 ones are for stills).
            guard size.width <= 3840, abs(Double(size.width) / Double(size.height) - 16.0 / 9.0) < 0.05 else { continue }
            let fps = min(60, format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 30)
            let hdr = format.supportedColorSpaces.contains(.HLG_BT2020)
            let score = Double(size.width * size.height) * 1000 + fps * 10 + (hdr ? 1 : 0)
            if best == nil || score > best!.score { best = (format, score, fps, hdr) }
        }
        return best.map { ($0.format, $0.fps, $0.hdr) }
    }

    private func configure(position: AVCaptureDevice.Position) {
        let label = applyConfiguration(position: position)
        // Only after commitConfiguration: startRunning inside a
        // begin/commit pair raises an exception (and takes the app with it).
        if !session.isRunning { session.startRunning() }
        DispatchQueue.main.async { self.formatLabel.text = label }
    }

    /// Sets up input, output and format; returns the label for the top bar.
    private func applyConfiguration(position: AVCaptureDevice.Position) -> String {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .inputPriority
        // Otherwise the session picks the colour space itself on commit,
        // undoing the HLG (HDR) choice below.
        session.automaticallyConfiguresCaptureDeviceForWideColor = false
        session.inputs.forEach { session.removeInput($0) }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return "" }
        session.addInput(input)
        if session.outputs.isEmpty, session.canAddOutput(movieOutput) {
            session.addOutput(movieOutput)
        }
        movieOutput.maxRecordedDuration = CMTime(seconds: maxDuration, preferredTimescale: 600)

        var label = ""
        if let (format, fps, hdr) = bestFormat(for: device), (try? device.lockForConfiguration()) != nil {
            device.activeFormat = format
            let duration = CMTime(value: 1, timescale: CMTimeScale(fps))
            device.activeVideoMinFrameDuration = duration
            device.activeVideoMaxFrameDuration = duration
            if hdr { device.activeColorSpace = .HLG_BT2020 }
            device.unlockForConfiguration()
            let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            label = "\(size.width >= 3840 ? "4K" : "\(min(size.width, size.height))p") · \(Int(fps)) FPS\(hdr ? " · HDR" : "")"
        }
        if let connection = movieOutput.connection(with: .video) {
            if connection.isVideoStabilizationSupported { connection.preferredVideoStabilizationMode = .auto }
            if #available(iOS 17.0, *) {
                if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
            } else if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            connection.isVideoMirrored = position == .front
        }
        return label
    }

    // MARK: - Controls

    private func buildControls() {
        let size: CGFloat = 84
        recordButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(recordButton)

        let track = CAShapeLayer()
        let path = UIBezierPath(arcCenter: CGPoint(x: size / 2, y: size / 2), radius: size / 2 - 3, startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true)
        track.path = path.cgPath
        track.fillColor = UIColor.clear.cgColor
        track.strokeColor = UIColor.white.withAlphaComponent(0.45).cgColor
        track.lineWidth = 4
        recordButton.layer.addSublayer(track)
        ring.path = path.cgPath
        ring.fillColor = UIColor.clear.cgColor
        ring.strokeColor = UIColor.white.cgColor
        ring.lineWidth = 4
        ring.lineCap = .round
        ring.strokeEnd = 0
        recordButton.layer.addSublayer(ring)

        dot.backgroundColor = .white
        dot.layer.cornerRadius = 31
        dot.isUserInteractionEnabled = false
        dot.frame = CGRect(x: 11, y: 11, width: 62, height: 62)
        recordButton.addSubview(dot)

        spinner.color = .white
        spinner.hidesWhenStopped = true
        spinner.isUserInteractionEnabled = false
        spinner.center = CGPoint(x: size / 2, y: size / 2)
        recordButton.addSubview(spinner)

        recordButton.addTarget(self, action: #selector(pressDown), for: .touchDown)
        recordButton.addTarget(self, action: #selector(pressUp), for: [.touchUpInside, .touchUpOutside])

        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
        for button in [closeButton, flipButton] {
            button.tintColor = .white
            button.layer.borderColor = UIColor.white.cgColor
            button.layer.borderWidth = 1
            button.layer.cornerRadius = 8
            button.backgroundColor = UIColor.black.withAlphaComponent(0.25)
            button.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(button)
        }
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        flipButton.addTarget(self, action: #selector(flip), for: .touchUpInside)

        for label in [formatLabel, hintLabel] {
            label.textColor = .white
            label.textAlignment = .center
            label.translatesAutoresizingMaskIntoConstraints = false
            label.layer.shadowColor = UIColor.black.cgColor
            label.layer.shadowOpacity = 0.4
            label.layer.shadowRadius = 4
            label.layer.shadowOffset = .zero
            view.addSubview(label)
        }
        formatLabel.font = .systemFont(ofSize: 12, weight: .medium)
        hintLabel.font = .systemFont(ofSize: 14, weight: .medium)
        hintLabel.text = hint

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            recordButton.widthAnchor.constraint(equalToConstant: size),
            recordButton.heightAnchor.constraint(equalToConstant: size),
            recordButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            recordButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -28),
            hintLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintLabel.bottomAnchor.constraint(equalTo: recordButton.topAnchor, constant: -18),
            closeButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 20),
            closeButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            flipButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
            flipButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            formatLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            formatLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
        ] + [closeButton, flipButton].flatMap { [$0.widthAnchor.constraint(equalToConstant: 40), $0.heightAnchor.constraint(equalToConstant: 40)] })
    }

    // Press starts recording right away. Letting go after a hold stops it; a
    // quick tap instead leaves it running until the next tap or the limit.
    @objc private func pressDown() {
        guard !stopping, !finished else { return }
        if movieOutput.isRecording {
            if tapMode { stopRecording() }
            return
        }
        pressStarted = Date()
        recordingStarted = nil
        tapMode = false
        try? FileManager.default.removeItem(at: output)
        sessionQueue.async { self.movieOutput.startRecording(to: self.output, recordingDelegate: self) }
        showRecording(true)
    }

    @objc private func pressUp() {
        guard let started = pressStarted else { return }
        pressStarted = nil
        if Date().timeIntervalSince(started) < 0.35 {
            tapMode = true
        } else {
            stopRecording()
        }
    }

    private func stopRecording() {
        showStopping()
        sessionQueue.async { if self.movieOutput.isRecording { self.movieOutput.stopRecording() } }
    }

    /// The moment recording ends — let go, tapped again, or the ring full —
    /// the screen says so: a tap of haptics, the camera dims, and a spinner
    /// takes the button while the file is written out and handed over.
    /// Without it the live camera stayed up for another second or two and
    /// looked like it was still recording.
    private func showStopping() {
        guard !stopping else { return }
        stopping = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        ring.removeAllAnimations()
        ring.strokeEnd = 0
        spinner.startAnimating()
        UIView.animate(withDuration: 0.2) {
            self.dot.alpha = 0
            self.dot.transform = .identity
            self.dot.layer.cornerRadius = 31
        }
        let dim = CABasicAnimation(keyPath: "opacity")
        dim.fromValue = previewLayer.opacity
        dim.toValue = 0.35
        dim.duration = 0.2
        previewLayer.opacity = 0.35
        previewLayer.add(dim, forKey: "dim")
    }

    /// Back to ready, for a clip too short to keep.
    private func resetAfterStopping() {
        stopping = false
        spinner.stopAnimating()
        previewLayer.removeAnimation(forKey: "dim")
        previewLayer.opacity = 1
        dot.alpha = 1
        showRecording(false)
    }

    private func showRecording(_ recording: Bool) {
        flipButton.isEnabled = !recording
        closeButton.isEnabled = !recording
        UIView.animate(withDuration: 0.2) {
            self.dot.transform = recording ? CGAffineTransform(scaleX: 0.55, y: 0.55) : .identity
            self.dot.layer.cornerRadius = recording ? 16 : 31
            self.hintLabel.alpha = recording ? 0 : 1
        }
        if !recording { ring.removeAllAnimations() }
    }

    /// The ring fills over exactly what's being recorded: it starts with the
    /// first frame written, not the press (the camera takes a moment to get
    /// going), and the clip is over the moment it's full.
    private func startRing() {
        let fill = CABasicAnimation(keyPath: "strokeEnd")
        fill.fromValue = 0
        fill.toValue = 1
        fill.duration = maxDuration
        fill.fillMode = .forwards
        fill.isRemovedOnCompletion = false
        ring.add(fill, forKey: "fill")
        take += 1
        let thisTake = take
        DispatchQueue.main.asyncAfter(deadline: .now() + maxDuration) { [weak self] in
            guard let self, self.take == thisTake, self.movieOutput.isRecording else { return }
            self.showStopping()
        }
    }

    @objc private func close() {
        finish(nil)
    }

    @objc private func flip() {
        position = position == .back ? .front : .back
        sessionQueue.async { self.configure(position: self.position) }
    }

    private func finish(_ url: URL?) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { self.completion(url) }
    }

    // MARK: - AVCaptureFileOutputRecordingDelegate

    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async {
            guard !self.stopping else { return }
            self.recordingStarted = Date()
            self.startRing()
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        // Reaching maxRecordedDuration also "fails" with an error, but the
        // file is complete; only a clip with nothing in it is thrown away.
        let recorded = (error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? (error == nil)
        let length = recordingStarted.map { Date().timeIntervalSince($0) } ?? 0
        DispatchQueue.main.async {
            if recorded, length >= 0.5 {
                self.showStopping()
                self.finish(outputFileURL)
            } else {
                try? FileManager.default.removeItem(at: outputFileURL)
                self.resetAfterStopping()
            }
        }
    }
}
