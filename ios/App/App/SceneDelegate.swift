import UIKit
import Capacitor

@available(iOS 13.0, *)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Ensure we have a UIWindowScene to attach a window to.
        guard let windowScene = scene as? UIWindowScene else { return }

        // Create Capacitor bridge view controller as the app's root controller.
        // CAPBridgeViewController initializes the Capacitor engine and loads
        // the bundled web assets from the configured webDir (www/public/out).
        let bridgeVC = CAPBridgeViewController()

        // Build the window and display the Capacitor WebView immediately.
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = bridgeVC
        window.makeKeyAndVisible()
        self.window = window
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let context = URLContexts.first else { return }

        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let sourceApplication = context.options.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = context.options.openInPlace

        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: context.url,
            options: options
        )
    }

}
