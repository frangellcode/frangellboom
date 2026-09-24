import Capacitor

/// Only exists to register the app's own plugins — Capacitor finds npm plugins
/// on its own, but a plugin living inside the app target has to be handed over.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VideoPickerPlugin())
        bridge?.registerPluginInstance(KeepAwakePlugin())
        bridge?.registerPluginInstance(LoopEnginePlugin())
        bridge?.registerPluginInstance(TipJarPlugin())
    }
}
