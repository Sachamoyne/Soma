/**
 * StoreKit service — iOS in-app purchases via native StoreKit 2 plugin.
 *
 * All functions are no-ops (or throw) on web.
 * Use isNativeIOS() before calling any function in non-guarded contexts.
 *
 * Product IDs (App Store Connect — existing subscriptions):
 *   com.soma.edu.starter.monthly.v3  → Starter plan
 *   com.soma.edu.pro.monthly.v3      → Pro plan
 */

import { isNativeIOS } from "@/lib/native";

// ─── Product IDs ──────────────────────────────────────────────────────────────

export const SK_PRODUCT_STARTER = "com.soma.edu.starter.monthly.v3";
export const SK_PRODUCT_PRO     = "com.soma.edu.pro.monthly.v3";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SKPlan = "free" | "starter" | "pro";

export interface SKProduct {
  productId:    string;
  title:        string;
  description:  string;
  priceString:  string;
  price:        number;
  currencyCode: string;
}

export interface SKPurchaseResult {
  plan:                  SKPlan;
  productId:             string;
  transactionId:         string;
  originalTransactionId: string;
}

export interface SKEntitlementsResult {
  plan:         SKPlan;
  transactions: Array<{
    productId:             string;
    transactionId:         string;
    originalTransactionId: string;
    plan:                  SKPlan;
  }>;
}

// ─── Plugin bridge ────────────────────────────────────────────────────────────
//
// registerPlugin() must be called exactly once per plugin name.
// Calling it multiple times produces "already registered" warnings and can
// cause Capacitor 8 to return a broken proxy on subsequent calls.
// The singleton is created lazily on first use.

type StoreKitPluginInterface = {
  loadProducts(opts?: Record<string, never>):        Promise<{ products: SKProduct[] }>;
  purchase(opts: { productId: string }):             Promise<SKPurchaseResult>;
  restore(opts?: Record<string, never>):             Promise<SKEntitlementsResult>;
  currentEntitlements(opts?: Record<string, never>): Promise<SKEntitlementsResult>;
};

let _plugin: StoreKitPluginInterface | null = null;
let _readyPromise: Promise<void> | null = null;

async function getPlugin(): Promise<StoreKitPluginInterface> {
  if (_plugin) return _plugin;
  const { registerPlugin } = await import("@capacitor/core");
  _plugin = registerPlugin<StoreKitPluginInterface>("StoreKitPlugin");
  return _plugin;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`[SK_TIMEOUT] ${label} after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

async function ensureNativeReady(): Promise<void> {
  if (!isNativeIOS()) return;
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    const plugin = await getPlugin();
    // Optional diagnostic (implemented natively). If missing, we still proceed.
    const maybePing = (plugin as any)?.ping as undefined | ((opts?: Record<string, never>) => Promise<any>);
    if (typeof maybePing === "function") {
      const res = await withTimeout(maybePing({}), 3000, "ping()");
      console.log("[SK] ping →", res);
    } else {
      console.warn("[SK] ping() not available on plugin proxy");
    }
  })();

  return _readyPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch available products from App Store Connect.
 * Returns [] on web or on error.
 */
export async function loadProducts(): Promise<SKProduct[]> {
  if (!isNativeIOS()) return [];
  try {
    await ensureNativeReady();
    const plugin = await getPlugin();
    const { products } = await withTimeout(plugin.loadProducts(), 10_000, "loadProducts()");
    console.log("[SK] loadProducts →", products.map((p) => `${p.productId} ${p.priceString}`));
    return products;
  } catch (err) {
    console.error("[SK] loadProducts failed:", err);
    return [];
  }
}

/**
 * Purchase a product by its App Store product ID.
 * Returns the resulting SKPlan on success.
 * Throws "PURCHASE_CANCELLED" on user cancellation.
 */
export async function purchaseProduct(productId: string): Promise<SKPurchaseResult> {
  if (!isNativeIOS()) throw new Error("[SK] purchaseProduct is only available on iOS.");
  console.log("[SK] purchaseProduct →", productId);
  await ensureNativeReady();
  const plugin = await getPlugin();
  const result = await withTimeout(plugin.purchase({ productId }), 120_000, "purchase()");
  console.log("[SK] purchase success →", result.plan, "txId:", result.transactionId);
  return result;
}

/**
 * Restore previous purchases (required by Apple App Store guidelines).
 * Calls AppStore.sync() then reads Transaction.currentEntitlements.
 * Returns the best active plan.
 */
export async function restorePurchases(): Promise<SKEntitlementsResult> {
  if (!isNativeIOS()) throw new Error("[SK] restorePurchases is only available on iOS.");
  console.log("[SK] restorePurchases...");
  await ensureNativeReady();
  const plugin = await getPlugin();
  const result = await withTimeout(plugin.restore(), 60_000, "restore()");
  console.log("[SK] restore → plan:", result.plan, "txCount:", result.transactions.length);
  return result;
}

/**
 * Read active entitlements from Transaction.currentEntitlements.
 * Returns "free" on web or when no subscription is active.
 */
export async function checkCurrentPlan(): Promise<SKPlan> {
  if (!isNativeIOS()) return "free";
  try {
    await ensureNativeReady();
    const plugin = await getPlugin();
    const result = await withTimeout(plugin.currentEntitlements(), 10_000, "currentEntitlements()");
    console.log("[SK] currentEntitlements → plan:", result.plan, "txCount:", result.transactions.length);
    return result.plan;
  } catch (err) {
    console.error("[SK] currentEntitlements failed:", err);
    return "free";
  }
}
