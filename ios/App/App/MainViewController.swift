import Capacitor

/// Only exists to register the app's own plugins — Capacitor finds npm plugins
/// on its own, but a plugin living inside the app target has to be handed over.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // iOS 26 lays a "scroll edge effect" over the web view under the
        // status bar and home indicator, filled with the view's background —
        // a solid band that hides whatever the page draws there (the home
        // screen's sky). Nothing in this app scrolls under those bars.
        if #available(iOS 26.0, *) {
            webView?.scrollView.topEdgeEffect.isHidden = true
            webView?.scrollView.bottomEdgeEffect.isHidden = true
        }
        bridge?.registerPluginInstance(VideoPickerPlugin())
        bridge?.registerPluginInstance(KeepAwakePlugin())
        bridge?.registerPluginInstance(LoopEnginePlugin())
        bridge?.registerPluginInstance(TipJarPlugin())
        bridge?.registerPluginInstance(CameraPlugin())
    }
}
