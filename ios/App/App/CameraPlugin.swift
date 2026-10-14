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
///
/// Pro adds a camera's worth of extras: real slow motion (120 fps, handed
/// back marked `slowMotion` so the editor opens it at half speed), a 3 or 10
/// second timer, and the back camera's other lenses (ultra wide, telephoto).
/// Without Pro they're there with a lock, and tapping one hands back
/// `paywall` so the web app can show the Pro sheet.
@objc(CameraPlugin)
public class CameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CameraPlugin"
    public let jsName = "Camera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
    ]

    /// Kept up after a recording until the web app calls close(), so the
    /// home screen never shows between the camera and the editor.
    private weak var camera: CameraViewController?

    private var recordedDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("recorded", isDirectory: true)
    }

    override public func load() {
        try? FileManager.default.removeItem(at: recordedDirectory)
    }

    /// Fades the camera away, once the editor is ready underneath it.
    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let camera = self.camera, camera.presentingViewController != nil else {
                call.resolve()
                return
            }
            camera.dismiss(animated: true) { call.resolve() }
        }
    }

    @objc func record(_ call: CAPPluginCall) {
        let maxDuration = call.getDouble("maxDuration") ?? 0.75
        let hint = call.getString("hint") ?? ""
        let pro = call.getBool("pro") ?? false
        // "Slow motion" on the home screen opens the camera at 120 fps.
        let startInSlowMotion = pro && call.getBool("slowMotion") == true
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard granted else {
                    call.reject("Camera access is off.", "DENIED")
                    return
                }
                try? FileManager.default.createDirectory(at: self.recordedDirectory, withIntermediateDirectories: true)
                let output = self.recordedDirectory.appendingPathComponent("\(UUID().uuidString).mov")
                let camera = CameraViewController(output: output, maxDuration: maxDuration, hint: hint, pro: pro, slowMotion: startInSlowMotion) { [weak self] result in
                    guard let self else { return }
                    switch result {
                    case .paywall:
                        call.resolve(["paywall": true])
                    case .recorded(let url, let slowMotion):
                        guard let webPath = self.bridge?.portablePath(fromLocalURL: url)?.absoluteString else {
                            call.resolve([:])
                            return
                        }
                        call.resolve(["video": ["webPath": webPath, "path": url.path, "name": "Recording.mov", "slowMotion": slowMotion]])
                    case .cancelled:
                        call.resolve([:])
                    }
                }
                // Over, not instead of, the web app: with .fullScreen iOS
                // takes the webview off screen and stops drawing it, so the
                // editor couldn't be put in place underneath (and a wait
                // for its next frame never ended).
                camera.modalPresentationStyle = .overFullScreen
                camera.modalPresentationCapturesStatusBarAppearance = true
                camera.modalTransitionStyle = .crossDissolve
                self.camera = camera
                self.bridge?.viewController?.present(camera, animated: true)
            }
        }
    }
}

enum CameraResult {
    case recorded(URL, slowMotion: Bool)
    case paywall
    case cancelled
}

final class CameraViewController: UIViewController, AVCaptureFileOutputRecordingDelegate {
    private let output: URL
    private let maxDuration: Double
    private let hint: String
    private let pro: Bool
    private let completion: (CameraResult) -> Void

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

    // Pro: slow motion, timer, lenses.
    private let slowButton = UIButton(type: .system)
    private let timerButton = UIButton(type: .system)
    private let lensStack = UIStackView()
    private let countdownLabel = UILabel()
    private var slowMotion = false
    private var timerSeconds = 0
    private var lens: AVCaptureDevice.DeviceType = .builtInWideAngleCamera
    private var countdown: Timer?
    /// The format actually running is slow motion (the phone may have none).
    private var recordingSlowMotion = false

    private var pressStarted: Date?
    private var recordingStarted: Date?
    private var tapMode = false
    private var stopping = false
    private var take = 0
    private var finished = false

    init(output: URL, maxDuration: Double, hint: String, pro: Bool, slowMotion: Bool = false, completion: @escaping (CameraResult) -> Void) {
        self.output = output
        self.maxDuration = maxDuration
        self.hint = hint
        self.pro = pro
        self.slowMotion = slowMotion
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
    /// highest frame rate up to 60, then HDR. For slow motion, the most pixels
    /// at 120 fps or more (recorded at 120).
    private func bestFormat(for device: AVCaptureDevice, slowMotion: Bool) -> (AVCaptureDevice.Format, Double, Bool)? {
        var best: (format: AVCaptureDevice.Format, score: Double, fps: Double, hdr: Bool)?
        for format in device.formats {
            let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            // Video formats only: 16:9, up to 4K (the 4:3 ones are for stills).
            guard size.width <= 3840, abs(Double(size.width) / Double(size.height) - 16.0 / 9.0) < 0.05 else { continue }
            let maxFps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 30
            if slowMotion && maxFps < 120 { continue }
            let fps = slowMotion ? 120 : min(60, maxFps)
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
        let lensType = position == .back ? lens : .builtInWideAngleCamera
        guard let device = AVCaptureDevice.default(lensType, for: .video, position: position)
                ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return "" }
        session.addInput(input)
        if session.outputs.isEmpty, session.canAddOutput(movieOutput) {
            session.addOutput(movieOutput)
        }
        movieOutput.maxRecordedDuration = CMTime(seconds: maxDuration, preferredTimescale: 600)

        var label = ""
        let found = (slowMotion ? bestFormat(for: device, slowMotion: true) : nil) ?? bestFormat(for: device, slowMotion: false)
        recordingSlowMotion = (found?.1 ?? 0) >= 120
        if let (format, fps, hdr) = found, (try? device.lockForConfiguration()) != nil {
            device.activeFormat = format
            let duration = CMTime(value: 1, timescale: CMTimeScale(fps))
            device.activeVideoMinFrameDuration = duration
            device.activeVideoMaxFrameDuration = duration
            // A slow-motion format may have no HDR: back to SDR then, as a
            // colour space the format doesn't offer isn't allowed.
            if hdr {
                device.activeColorSpace = .HLG_BT2020
            } else if format.supportedColorSpaces.contains(.sRGB) {
                device.activeColorSpace = .sRGB
            }
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
        buildProControls()

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
    // With the timer on, a press starts the countdown instead (another press
    // cancels it), and the clip then runs as a tapped one would.
    @objc private func pressDown() {
        guard !stopping, !finished else { return }
        if movieOutput.isRecording {
            if tapMode { stopRecording() }
            return
        }
        if countdown != nil {
            cancelCountdown()
            return
        }
        if timerSeconds > 0 {
            startCountdown()
            return
        }
        pressStarted = Date()
        tapMode = false
        beginRecording()
    }

    private func beginRecording() {
        recordingStarted = nil
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
        for control in [slowButton, timerButton, lensStack] as [UIView] {
            UIView.animate(withDuration: 0.2) { control.alpha = recording ? 0 : 1 }
            control.isUserInteractionEnabled = !recording
        }
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
        cancelCountdown()
        finish(nil)
    }

    @objc private func flip() {
        position = position == .back ? .front : .back
        refreshProControls()
        sessionQueue.async { self.configure(position: self.position) }
    }

    /// A clip is handed over with the camera still up (dimmed, spinner
    /// going) — the web app closes it once the editor is in place. Closing
    /// without a clip dismisses right away.
    private func finish(_ url: URL?, paywall: Bool = false) {
        guard !finished else { return }
        finished = true
        if let url {
            completion(.recorded(url, slowMotion: recordingSlowMotion))
            // A safety net: never stuck on the camera if the web app
            // doesn't get round to closing it.
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                guard let self, self.presentingViewController != nil else { return }
                self.dismiss(animated: true)
            }
        } else {
            dismiss(animated: true) { self.completion(paywall ? .paywall : .cancelled) }
        }
    }

    // MARK: - Pro controls

    private func buildProControls() {
        for button in [slowButton, timerButton] {
            button.tintColor = .white
            button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
            button.layer.borderColor = UIColor.white.cgColor
            button.layer.borderWidth = 1
            button.layer.cornerRadius = 8
            button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 10)
            button.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(button)
        }
        slowButton.addTarget(self, action: #selector(toggleSlowMotion), for: .touchUpInside)
        timerButton.addTarget(self, action: #selector(cycleTimer), for: .touchUpInside)

        lensStack.axis = .horizontal
        lensStack.spacing = 6
        lensStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(lensStack)

        countdownLabel.font = .systemFont(ofSize: 120, weight: .bold)
        countdownLabel.textColor = .white
        countdownLabel.textAlignment = .center
        countdownLabel.alpha = 0
        countdownLabel.layer.shadowColor = UIColor.black.cgColor
        countdownLabel.layer.shadowOpacity = 0.4
        countdownLabel.layer.shadowRadius = 12
        countdownLabel.layer.shadowOffset = .zero
        countdownLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(countdownLabel)

        NSLayoutConstraint.activate([
            timerButton.heightAnchor.constraint(equalToConstant: 40),
            timerButton.centerYAnchor.constraint(equalTo: recordButton.centerYAnchor),
            timerButton.trailingAnchor.constraint(equalTo: recordButton.leadingAnchor, constant: -28),
            slowButton.heightAnchor.constraint(equalToConstant: 40),
            slowButton.centerYAnchor.constraint(equalTo: recordButton.centerYAnchor),
            slowButton.leadingAnchor.constraint(equalTo: recordButton.trailingAnchor, constant: 28),
            lensStack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            lensStack.bottomAnchor.constraint(equalTo: hintLabel.topAnchor, constant: -14),
            lensStack.heightAnchor.constraint(equalToConstant: 36),
            countdownLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            countdownLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        refreshProControls()
    }

    /// The back camera's lenses this phone has, with how much each one zooms
    /// next to the main camera (measured from their fields of view).
    private lazy var lenses: [(type: AVCaptureDevice.DeviceType, label: String)] = {
        guard let wide = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return [] }
        let span = { (device: AVCaptureDevice) in tan(Double(device.activeFormat.videoFieldOfView) * .pi / 360) }
        var found: [(AVCaptureDevice.DeviceType, String)] = []
        if AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil {
            found.append((.builtInUltraWideCamera, "0.5"))
        }
        found.append((.builtInWideAngleCamera, "1×"))
        if let tele = AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back) {
            let zoom = Int((span(wide) / span(tele)).rounded())
            found.append((.builtInTelephotoCamera, "\(max(2, zoom))"))
        }
        return found.count > 1 ? found : []
    }()

    private func refreshProControls() {
        let lock = pro ? nil : UIImage(systemName: "lock.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 10, weight: .semibold))
        slowButton.setImage(lock, for: .normal)
        slowButton.setTitle(" 120 FPS", for: .normal)
        timerButton.setImage(lock ?? UIImage(systemName: "timer", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)), for: .normal)
        timerButton.setTitle(timerSeconds > 0 ? " \(timerSeconds)s" : " Off", for: .normal)
        style(slowButton, on: slowMotion)
        style(timerButton, on: timerSeconds > 0)

        lensStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard position == .back else { return }
        for (index, option) in lenses.enumerated() {
            let button = UIButton(type: .system)
            button.setTitle(option.label, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
            button.tintColor = .white
            button.layer.cornerRadius = 18
            button.tag = index
            button.widthAnchor.constraint(equalToConstant: 44).isActive = true
            style(button, on: option.type == lens)
            if !pro && option.type != .builtInWideAngleCamera { button.alpha = 0.6 }
            button.addTarget(self, action: #selector(pickLens(_:)), for: .touchUpInside)
            lensStack.addArrangedSubview(button)
        }
    }

    private func style(_ button: UIButton, on: Bool) {
        button.backgroundColor = on ? .white : UIColor.black.withAlphaComponent(0.25)
        button.tintColor = on ? .black : .white
        button.setTitleColor(on ? .black : .white, for: .normal)
    }

    /// Without Pro, any of the extras opens the Pro sheet instead.
    private func requirePro() -> Bool {
        guard pro else {
            cancelCountdown()
            finish(nil, paywall: true)
            return false
        }
        return true
    }

    @objc private func toggleSlowMotion() {
        guard requirePro() else { return }
        slowMotion.toggle()
        UISelectionFeedbackGenerator().selectionChanged()
        refreshProControls()
        sessionQueue.async { self.configure(position: self.position) }
    }

    @objc private func cycleTimer() {
        guard requirePro() else { return }
        timerSeconds = timerSeconds == 0 ? 3 : timerSeconds == 3 ? 10 : 0
        UISelectionFeedbackGenerator().selectionChanged()
        refreshProControls()
    }

    @objc private func pickLens(_ sender: UIButton) {
        let option = lenses[sender.tag]
        guard option.type != lens else { return }
        if option.type != .builtInWideAngleCamera { guard requirePro() else { return } }
        lens = option.type
        UISelectionFeedbackGenerator().selectionChanged()
        refreshProControls()
        sessionQueue.async { self.configure(position: self.position) }
    }

    private func startCountdown() {
        var remaining = timerSeconds
        showCount(remaining)
        hintLabel.alpha = 0
        countdown = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            guard let self else { return timer.invalidate() }
            remaining -= 1
            if remaining > 0 {
                self.showCount(remaining)
            } else {
                self.cancelCountdown()
                self.tapMode = true
                self.beginRecording()
            }
        }
    }

    private func showCount(_ value: Int) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        countdownLabel.text = "\(value)"
        countdownLabel.alpha = 1
        countdownLabel.transform = CGAffineTransform(scaleX: 1.3, y: 1.3)
        UIView.animate(withDuration: 0.35, delay: 0, options: .curveEaseOut) {
            self.countdownLabel.transform = .identity
        }
    }

    private func cancelCountdown() {
        countdown?.invalidate()
        countdown = nil
        UIView.animate(withDuration: 0.2) {
            self.countdownLabel.alpha = 0
            self.hintLabel.alpha = 1
        }
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
