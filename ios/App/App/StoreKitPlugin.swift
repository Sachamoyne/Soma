import Foundation
import Capacitor
import StoreKit

// ─── Plan ─────────────────────────────────────────────────────────────────────

private enum Plan: String {
    case none    = "free"
    case starter = "starter"
    case pro     = "pro"
}

private let PRODUCT_IDS: Set<String> = [
    "com.soma.edu.starter.monthly.v3",
    "com.soma.edu.pro.monthly.v3"
]

private func planForProduct(_ productId: String) -> Plan {
    switch productId {
    case "com.soma.edu.pro.monthly.v3":     return .pro
    case "com.soma.edu.starter.monthly.v3": return .starter
    default:                                return .none
    }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKitPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadProducts",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore",              returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements",  returnType: CAPPluginReturnPromise),
    ]

    // ── loadProducts ──────────────────────────────────────────────────────────
    @objc func loadProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: PRODUCT_IDS)
                let result = products.map { p -> [String: Any] in
                    [
                        "productId":    p.id,
                        "title":        p.displayName,
                        "description":  p.description,
                        "priceString":  p.displayPrice,
                        "price":        Double(truncating: p.price as NSDecimalNumber),
                        "currencyCode": p.priceFormatStyle.currencyCode,
                    ]
                }
                call.resolve(["products": result])
            } catch {
                call.reject("loadProducts failed: \(error.localizedDescription)")
            }
        }
    }

    // ── purchase ──────────────────────────────────────────────────────────────
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Missing productId")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verificationResult):
                    switch verificationResult {
                    case .verified(let transaction):
                        await transaction.finish()
                        let plan = planForProduct(transaction.productID)
                        call.resolve([
                            "plan":                   plan.rawValue,
                            "productId":              transaction.productID,
                            "transactionId":          transaction.id.description,
                            "originalTransactionId":  transaction.originalID.description,
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaction unverified: \(error.localizedDescription)")
                    }

                case .userCancelled:
                    call.reject("PURCHASE_CANCELLED")

                case .pending:
                    call.reject("PURCHASE_PENDING")

                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // ── restore ───────────────────────────────────────────────────────────────
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                // Ask App Store to sync — required for cross-device restore
                try await AppStore.sync()
            } catch {
                // sync() can throw if the user cancels the App Store sign-in.
                // We still fall through and read currentEntitlements.
                print("[StoreKit] AppStore.sync() threw (user may have cancelled): \(error)")
            }

            do {
                let (plan, transactions) = try await Self.readCurrentEntitlements()
                call.resolve([
                    "plan":         plan.rawValue,
                    "transactions": transactions,
                ])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    // ── currentEntitlements ───────────────────────────────────────────────────
    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            do {
                let (plan, transactions) = try await Self.readCurrentEntitlements()
                call.resolve([
                    "plan":         plan.rawValue,
                    "transactions": transactions,
                ])
            } catch {
                call.reject("currentEntitlements failed: \(error.localizedDescription)")
            }
        }
    }

    // ── Shared helper ─────────────────────────────────────────────────────────

    private static func readCurrentEntitlements() async throws -> (Plan, [[String: Any]]) {
        var bestPlan = Plan.none
        var txList: [[String: Any]] = []

        for await result in Transaction.currentEntitlements {
            switch result {
            case .verified(let tx):
                let p = planForProduct(tx.productID)
                // Pro > Starter > none
                if p == .pro || (p == .starter && bestPlan == .none) {
                    bestPlan = p
                }
                txList.append([
                    "productId":             tx.productID,
                    "transactionId":         tx.id.description,
                    "originalTransactionId": tx.originalID.description,
                    "plan":                  p.rawValue,
                ])
            case .unverified(_, let error):
                print("[StoreKit] Unverified entitlement skipped: \(error)")
            }
        }

        return (bestPlan, txList)
    }
}
