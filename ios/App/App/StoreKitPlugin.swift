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
//
// @MainActor isolation is required because:
//   - product.purchase() presents native system UI → must run on main thread
//   - Task {} created inside a @MainActor context inherits that context,
//     so all async work runs on the main actor without deadlocking

@objc(StoreKitPlugin)
@MainActor
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKitPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadProducts",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
    ]

    // Product cache — populated by loadProducts(), reused by purchase()
    // to avoid a second Product.products(for:) fetch at tap time.
    private var cachedProducts: [String: Product] = [:]

    // ── loadProducts ──────────────────────────────────────────────────────────
    @objc func loadProducts(_ call: CAPPluginCall) {
        print("[StoreKit] loadProducts called — IDs: \(PRODUCT_IDS.sorted())")
        Task {
            do {
                let products = try await Product.products(for: PRODUCT_IDS)
                print("[StoreKit] loadProducts — loaded \(products.count) product(s)")
                for p in products {
                    print("[StoreKit]   ✓ \(p.id) | \(p.displayPrice)")
                    cachedProducts[p.id] = p
                }
                if products.isEmpty {
                    print("[StoreKit] ⚠️ 0 products — verify Soma.storekit is set in scheme Run > Options")
                }
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
                print("[StoreKit] loadProducts error: \(error)")
                call.reject("loadProducts failed: \(error.localizedDescription)")
            }
        }
    }

    // ── purchase ──────────────────────────────────────────────────────────────
    @objc func purchase(_ call: CAPPluginCall) {
        // This log is OUTSIDE the Task — appears immediately when the method is called.
        // If you do NOT see this line, the native plugin method is not being invoked.
        guard let productId = call.getString("productId") else {
            print("[StoreKit] purchase ERROR — missing productId parameter")
            call.reject("Missing productId")
            return
        }
        print("[StoreKit] ── purchase() called — productId: \(productId)")

        Task {
            do {
                // ── Resolve product (cache first, then fetch) ─────────────────
                let product: Product
                if let cached = cachedProducts[productId] {
                    print("[StoreKit] using cached product: \(cached.id)")
                    product = cached
                } else {
                    print("[StoreKit] product not in cache — fetching: \(productId)")
                    let fetched = try await Product.products(for: [productId])
                    print("[StoreKit] fetched \(fetched.count) product(s)")
                    guard let p = fetched.first else {
                        print("[StoreKit] ERROR — product not found: \(productId)")
                        call.reject("Product not found: \(productId)")
                        return
                    }
                    cachedProducts[p.id] = p
                    product = p
                }
                print("[StoreKit] product ready: \(product.id) \(product.displayPrice)")

                // ── Trigger purchase sheet ─────────────────────────────────────
                // Runs on @MainActor (inherited from class isolation).
                // This presents the native Apple payment sheet.
                print("[StoreKit] calling product.purchase() ...")
                let result = try await product.purchase()
                print("[StoreKit] purchase result: \(result)")

                // ── Handle result ──────────────────────────────────────────────
                switch result {
                case .success(let verificationResult):
                    print("[StoreKit] .success — verifying transaction...")
                    switch verificationResult {
                    case .verified(let transaction):
                        print("[StoreKit] transaction VERIFIED — id: \(transaction.id) product: \(transaction.productID)")
                        await transaction.finish()
                        print("[StoreKit] transaction finished")
                        let plan = planForProduct(transaction.productID)
                        print("[StoreKit] resolved plan: \(plan.rawValue)")
                        call.resolve([
                            "plan":                  plan.rawValue,
                            "productId":             transaction.productID,
                            "transactionId":         transaction.id.description,
                            "originalTransactionId": transaction.originalID.description,
                        ])

                    case .unverified(_, let error):
                        print("[StoreKit] transaction UNVERIFIED: \(error)")
                        call.reject("Transaction unverified: \(error.localizedDescription)")
                    }

                case .userCancelled:
                    print("[StoreKit] purchase CANCELLED by user")
                    call.reject("PURCHASE_CANCELLED")

                case .pending:
                    print("[StoreKit] purchase PENDING (parental approval?)")
                    call.reject("PURCHASE_PENDING")

                @unknown default:
                    print("[StoreKit] purchase unknown result")
                    call.reject("Unknown purchase result")
                }
            } catch {
                print("[StoreKit] purchase THREW: \(error)")
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // ── restore ───────────────────────────────────────────────────────────────
    @objc func restore(_ call: CAPPluginCall) {
        print("[StoreKit] restore called")
        Task {
            do {
                print("[StoreKit] calling AppStore.sync()...")
                try await AppStore.sync()
                print("[StoreKit] AppStore.sync() completed")
            } catch {
                print("[StoreKit] AppStore.sync() threw (user may have cancelled): \(error)")
            }
            do {
                let (plan, transactions) = try await Self.readCurrentEntitlements()
                print("[StoreKit] restore complete — plan: \(plan.rawValue) txCount: \(transactions.count)")
                call.resolve(["plan": plan.rawValue, "transactions": transactions])
            } catch {
                print("[StoreKit] restore error: \(error)")
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    // ── currentEntitlements ───────────────────────────────────────────────────
    @objc func currentEntitlements(_ call: CAPPluginCall) {
        print("[StoreKit] currentEntitlements called")
        Task {
            do {
                let (plan, transactions) = try await Self.readCurrentEntitlements()
                print("[StoreKit] currentEntitlements — plan: \(plan.rawValue) txCount: \(transactions.count)")
                call.resolve(["plan": plan.rawValue, "transactions": transactions])
            } catch {
                print("[StoreKit] currentEntitlements error: \(error)")
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
                print("[StoreKit] unverified entitlement skipped: \(error)")
            }
        }
        return (bestPlan, txList)
    }
}
