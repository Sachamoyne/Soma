import Capacitor

/// Custom bridge view controller that explicitly registers local plugins.
///
/// Capacitor 8 does not reliably auto-discover plugins that live in the main
/// app target (as opposed to plugins installed via SPM/npm). Overriding
/// capacitorDidLoad() and calling bridge?.registerPluginInstance(_:) is the
/// guaranteed registration path used by Capacitor's own documentation for
/// local ("in-app") plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        print("[Capacitor] MainViewController.capacitorDidLoad() — registering StoreKitPlugin")
        bridge?.registerPluginInstance(StoreKitPlugin())
    }
}
