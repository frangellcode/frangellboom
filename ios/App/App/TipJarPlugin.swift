import Capacitor
import StoreKit

/// The iOS side of the "support Frangellboom" button.
///
/// Apple doesn't allow an App Store app to link out to PayPal for a tip
/// (guideline 3.1.1), so the web build's donate link becomes a tip jar here:
/// a few consumable in-app purchases that unlock nothing. Each purchase is
/// finished right away — there is no entitlement to keep or restore.
///
/// StoreKit 2 only, no third-party SDK: nothing about the person leaves the
/// device beyond what Apple itself handles, which keeps the privacy label at
/// "Data Not Collected".
@objc(TipJarPlugin)
public class TipJarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TipJarPlugin"
    public let jsName = "TipJar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
    ]

    @MainActor private var products: [String: Product] = [:]
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // A purchase can complete outside purchase() below — Ask to Buy, an
        // interrupted payment, a card that needed fixing first. StoreKit keeps
        // redelivering those until they're finished, so finish them here.
        updatesTask = Task.detached {
            for await result in Transaction.updates {
                switch result {
                case .verified(let transaction), .unverified(let transaction, _):
                    await transaction.finish()
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("productIds", String.self) ?? []
        Task { @MainActor in
            do {
                let found = try await Product.products(for: ids).sorted { $0.price < $1.price }
                for product in found { self.products[product.id] = product }
                call.resolve([
                    "products": found.map { product in
                        [
                            "id": product.id,
                            "displayName": product.displayName,
                            "displayPrice": product.displayPrice,
                        ]
                    },
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task { @MainActor in
            guard let product = self.products[id] else {
                call.reject("Unknown product \(id) — call getProducts first")
                return
            }
            do {
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = self.bridge?.viewController?.view.window?.windowScene {
                    result = try await product.purchase(confirmIn: scene)
                } else {
                    result = try await product.purchase()
                }
                switch result {
                case .success(let verification):
                    // A tip grants nothing, so there is nothing to protect by
                    // refusing an unverified one — the money moved either way.
                    switch verification {
                    case .verified(let transaction), .unverified(let transaction, _):
                        await transaction.finish()
                    }
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
}
