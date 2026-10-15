import Capacitor
import StoreKit

/// Frangellboom Pro: one purchase, kept for good, that unlocks the extra
/// modes and looks, the Pro camera, Live Photos and the top export qualities.
///
/// StoreKit 2 only, no third-party SDK and no server: the entitlement is the
/// signed transaction on the device, which keeps the privacy label at
/// "Data Not Collected". Same shape as PolarGrid's Pro.
@objc(ProPlugin)
public class ProPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProPlugin"
    public let jsName = "Pro"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    /// Must match the non-consumable in App Store Connect (and
    /// Frangellboom.storekit for local testing) character for character.
    static let productId = "com.frangellcode.frangellboom.pro"

    @MainActor private var product: Product?
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // A purchase can complete outside purchase() below — Ask to Buy, an
        // interrupted payment — and a refund can take Pro away. StoreKit
        // delivers those here; the web app hears about them as statusChange.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                if transaction.productID == ProPlugin.productId {
                    let isPro = await ProPlugin.hasEntitlement()
                    self?.notifyListeners("statusChange", data: ["isPro": isPro])
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    static func hasEntitlement() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == productId, transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        Task {
            call.resolve(["isPro": await ProPlugin.hasEntitlement()])
        }
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let found = try await Product.products(for: [ProPlugin.productId]).first else {
                    call.reject("Pro is not available right now")
                    return
                }
                self.product = found
                call.resolve(["id": found.id, "displayName": found.displayName, "displayPrice": found.displayPrice])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let product: Product
                if let cached = self.product {
                    product = cached
                } else if let found = try await Product.products(for: [ProPlugin.productId]).first {
                    product = found
                } else {
                    call.reject("Pro is not available right now")
                    return
                }
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = self.bridge?.viewController?.view.window?.windowScene {
                    result = try await product.purchase(confirmIn: scene)
                } else {
                    result = try await product.purchase()
                }
                switch result {
                case .success(let verification):
                    // Pro is something kept, so unlike a tip an unverified
                    // transaction doesn't count.
                    guard case .verified(let transaction) = verification else {
                        call.reject("The purchase couldn't be verified")
                        return
                    }
                    await transaction.finish()
                    call.resolve(["status": "purchased"])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// The Restore button Apple requires for a non-consumable.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["isPro": await ProPlugin.hasEntitlement()])
        }
    }
}
