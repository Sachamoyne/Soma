/**
 * RevenueCat service — iOS in-app purchases only.
 *
 * All functions are no-ops (or throw) on web.
 * Use isNativeIOS() before calling any function in non-guarded contexts.
 *
 * Entitlements (must match RevenueCat dashboard exactly — lowercase):
 *   "starter"  → Starter plan
 *   "pro"      → Pro plan
 *
 * Package identifiers inside offering "default_v3":
 *   "$rc_monthly"  → Starter  (package identifier in RC dashboard)
 *   "pro_monthly"  → Pro      (package identifier in RC dashboard)
 *
 * Offering resolution order:
 *   1. offerings.current         (RC "Current" flag — should be "default_v3")
 *   2. offerings.all["default_v3"]  (name-based fallback if Current not set)
 */

import { isNativeIOS } from "@/lib/native";

// ─── Debug flag ───────────────────────────────────────────────────────────────
// Set DEBUG_RC = false before production release to suppress verbose logs.
const DEBUG_RC = true;

// ─── Target offering ─────────────────────────────────────────────────────────
/** Offering identifier flagged as "Current" in the RevenueCat dashboard. */
const RC_OFFERING_TARGET = "default_v3";

// ─── Readiness tracking ───────────────────────────────────────────────────────
//
// Problem: IOSPaywall.loadData() (child effect) runs before useRevenueCat's
// initAndSync() (parent effect) finishes configuring RevenueCat.  React runs
// children effects before parent effects in the same commit, so Purchases.*
// calls in the paywall always race against Purchases.configure().
//
// Fix: track a module-level promise that resolves when configure() succeeds.
// All functions that require an initialized SDK await this promise first.
// A 10-second timeout prevents indefinite hangs if init never completes.

let _isConfigured = false;
let _initFailed = false;
let _resolveConfigured: (() => void) | null = null;
let _rejectConfigured: ((err: Error) => void) | null = null;
const _configuredPromise: Promise<void> = new Promise<void>((resolve, reject) => {
  _resolveConfigured = resolve;
  _rejectConfigured = reject;
});

function waitForConfigured(timeoutMs = 10_000): Promise<void> {
  if (_isConfigured) return Promise.resolve();
  if (_initFailed) return Promise.reject(new Error("[RC] SDK initialization previously failed — cannot purchase."));
  return Promise.race([
    _configuredPromise,
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error("[RC] Init timeout — Purchases not configured after " + timeoutMs + "ms")),
        timeoutMs
      )
    ),
  ]);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RC_IOS_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "";

/**
 * Entitlement identifiers — must match RevenueCat dashboard exactly (lowercase).
 * These are used as keys in customerInfo.entitlements.active.
 */
export const RC_ENTITLEMENT_STARTER = "starter";
export const RC_ENTITLEMENT_PRO = "pro";

/**
 * RC package identifiers — used only for price display (finding packages in the
 * pre-fetched offering to show priceString). NOT used for purchase lookup.
 */
export const RC_PACKAGE_STARTER = "$rc_monthly";
export const RC_PACKAGE_PRO = "pro_monthly";

/**
 * App Store product identifiers — used for purchase lookup via StoreKit.
 * These come from App Store Connect and are stable regardless of RC config.
 * Purchase lookup uses productIdentifier (not the RC package identifier) to
 * avoid mismatches if the RC dashboard package identifier differs.
 */
export const RC_PRODUCT_STARTER = "com.soma.edu.starter.monthly.v3";
export const RC_PRODUCT_PRO = "com.soma.edu.pro.monthly.v3";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RCPlan = "free" | "starter" | "pro";

export interface RCProduct {
  title: string;
  description: string;
  price: number;
  priceString: string;
  currencyCode: string;
}

export interface RCPackage {
  identifier: string;
  packageType: string;
  product: RCProduct;
}

export interface RCOffering {
  identifier: string;
  serverDescription: string;
  availablePackages: RCPackage[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derives a RCPlan from a RevenueCat CustomerInfo object.
 * Pro takes precedence over Starter.
 * Entitlement keys must match RC dashboard exactly (lowercase: "starter", "pro").
 */
function planFromCustomerInfo(customerInfo: any): RCPlan {
  const active = customerInfo?.entitlements?.active ?? {};
  if (DEBUG_RC) {
    console.log("[RC] entitlements.active keys:", Object.keys(active));
  }
  if (active[RC_ENTITLEMENT_PRO]) return "pro";
  if (active[RC_ENTITLEMENT_STARTER]) return "starter";
  return "free";
}

/**
 * Explicit plan mapping from App Store product identifier.
 * Used as fallback when entitlements are not yet reflected after purchase.
 */
function planFromProductIdentifier(productId: string): RCPlan | null {
  if (productId === RC_PRODUCT_PRO) return "pro";
  if (productId === RC_PRODUCT_STARTER) return "starter";
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize RevenueCat with the authenticated Supabase user ID.
 * Must be called once per session, after auth is confirmed.
 * No-op on web.
 */
export async function initRevenueCat(userId: string): Promise<void> {
  console.log("[RC] initRevenueCat called. isNativeIOS:", isNativeIOS(), "| userId:", userId);

  if (!isNativeIOS()) {
    console.log("[RC] Not native iOS — skipping init.");
    return;
  }

  if (!RC_IOS_API_KEY || RC_IOS_API_KEY === "appl_REPLACE_ME") {
    const err = new Error("[RC] NEXT_PUBLIC_REVENUECAT_IOS_KEY is not set.");
    console.error(err.message);
    _initFailed = true;
    _rejectConfigured?.(err);
    return;
  }

  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");

    const maskedKey =
      RC_IOS_API_KEY.length > 8
        ? RC_IOS_API_KEY.slice(0, 4) + "…" + RC_IOS_API_KEY.slice(-4)
        : "(too short)";
    console.log("[RC] Calling Purchases.configure(). Key:", maskedKey, "| User:", userId);

    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: RC_IOS_API_KEY, appUserID: userId });

    _isConfigured = true;
    _resolveConfigured?.();

    console.log("[RC] Initialized successfully ✓ User:", userId);
  } catch (error: any) {
    console.error("[RC] configure() threw:", error?.message ?? error);
    console.error("[RC] full init error:", JSON.stringify(error));
    _initFailed = true;
    _rejectConfigured?.(new Error("[RC] configure() failed: " + String(error?.message ?? error)));
  }
}

/**
 * Fetch available offerings from RevenueCat.
 * Returns the offering "default_v3" (via current or name-based fallback).
 * Returns null on web or if no offering is available.
 */
export async function getOfferings(): Promise<RCOffering | null> {
  if (!isNativeIOS()) return null;

  try {
    await waitForConfigured();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");

    let result = await Purchases.getOfferings();

    if (DEBUG_RC) {
      console.log("[RC] getOfferings — current:", result.current?.identifier ?? null);
      console.log(
        "[RC] getOfferings — current packages:",
        result.current?.availablePackages?.map((p: any) => p.identifier) ?? []
      );
      console.log("[RC] getOfferings — all keys:", Object.keys(result.all ?? {}));
    }

    // If current is null, wait 2 s and retry once (StoreKit cold-start timing).
    if (!result.current) {
      console.warn("[RC] offerings.current is null — retrying in 2 s…");
      await new Promise<void>((r) => setTimeout(r, 2000));
      result = await Purchases.getOfferings();

      if (DEBUG_RC) {
        console.log("[RC] retry — current:", result.current?.identifier ?? null);
        console.log(
          "[RC] retry — packages:",
          result.current?.availablePackages?.map((p: any) => p.identifier) ?? []
        );
        console.log("[RC] retry — all keys:", Object.keys(result.all ?? {}));
      }
    }

    // ── Resolve: current → all["default_v3"] → null ──────────────────────────
    let resolved: any = result.current;

    if (!resolved && result.all?.[RC_OFFERING_TARGET]) {
      resolved = result.all[RC_OFFERING_TARGET];
      console.warn(
        `[RC] offerings.current is null — falling back to offerings.all["${RC_OFFERING_TARGET}"].`,
        "Identifier:", resolved.identifier,
        "| Packages:", resolved.availablePackages?.map((p: any) => p.identifier) ?? []
      );
    }

    if (!resolved) {
      console.warn(
        "[RC] No offering resolved. Available keys:",
        Object.keys(result.all ?? {})
      );
      return null;
    }

    // Warn if the resolved offering is not the expected target (misconfiguration).
    if (resolved.identifier !== RC_OFFERING_TARGET) {
      console.warn(
        `[RC] WARNING: resolved offering is "${resolved.identifier}", expected "${RC_OFFERING_TARGET}". ` +
          "Check the RC dashboard Current flag."
      );
    }

    if (DEBUG_RC) {
      console.log(
        "[RC] Resolved offering:", resolved.identifier,
        "| Packages:", resolved.availablePackages?.map((p: any) => p.identifier) ?? []
      );
    }

    return {
      identifier: resolved.identifier,
      serverDescription: resolved.serverDescription,
      availablePackages: (resolved.availablePackages ?? []).map((pkg: any) => ({
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        product: {
          title: pkg.product.title,
          description: pkg.product.description,
          price: pkg.product.price,
          priceString: pkg.product.priceString,
          currencyCode: pkg.product.currencyCode,
        },
      })),
    };
  } catch (error) {
    console.error("[RC] Failed to fetch offerings:", error);
    return null;
  }
}

/**
 * Purchase a plan by its App Store product identifier.
 * Accepts RC_PRODUCT_STARTER or RC_PRODUCT_PRO.
 * Returns the resulting plan on success.
 * Throws on user cancellation or payment error.
 *
 * Package lookup uses App Store product identifier (p.product.productIdentifier)
 * rather than RC package identifier (p.identifier), because the product ID comes
 * directly from App Store Connect and is stable regardless of RC dashboard config.
 *
 * Plan determination priority:
 *   1. RC entitlements from returned customerInfo (source of truth)
 *   2. Explicit productId→plan mapping fallback if entitlements not yet reflected
 */
export async function purchasePackage(productId: string): Promise<RCPlan> {
  // ── Platform guard ──────────────────────────────────────────────────────────
  // Uses isNativeIOS() (already imported at top of file) — no extra dynamic import.
  console.log("[IAP] purchasePackage() called. productId:", productId, "| isNativeIOS:", isNativeIOS());
  if (!isNativeIOS()) {
    throw new Error("[IAP] purchasePackage is only available on iOS.");
  }

  // ── Wait for RC SDK to finish Purchases.configure() ─────────────────────────
  console.log("[IAP] Waiting for RC SDK to be configured...");
  await waitForConfigured();
  console.log("[IAP] RC SDK is configured ✓");
  const { Purchases } = await import("@revenuecat/purchases-capacitor");

  // ── Fetch offerings ─────────────────────────────────────────────────────────
  console.log("[IAP] Fetching offerings for purchase...");
  const result = await Purchases.getOfferings();

  const current = result.current ?? result.all?.[RC_OFFERING_TARGET] ?? null;

  if (!current) {
    console.error("[IAP ERROR] No current offering found. All keys:", Object.keys(result.all ?? {}));
    throw new Error("[IAP ERROR] No current offering found");
  }

  // ── Log all available packages with both identifiers ────────────────────────
  const packages = current.availablePackages ?? [];
  console.log("[IAP] Offering:", current.identifier, "| Package count:", packages.length);
  packages.forEach((p: any, i: number) => {
    // p.identifier       = RC package identifier (e.g. "$rc_monthly")
    // p.product.identifier = App Store product ID (e.g. "com.soma.edu.starter.monthly.v3")
    console.log(
      `[IAP] Package[${i}] pkgId="${p.identifier}" | productId="${p.product?.identifier ?? "?"}" | price="${p.product?.priceString ?? "?"}"`
    );
  });
  console.log("[IAP] Looking for productId:", productId);

  // ── Find package by App Store product identifier ─────────────────────────────
  // p.product.identifier is the App Store Connect product ID on PurchasesStoreProduct.
  // This is distinct from p.identifier which is the RC package identifier.
  const pkg = packages.find((p: any) => p.product?.identifier === productId);

  if (!pkg) {
    console.error(
      "[IAP ERROR] Package is undefined — productId not found:",
      productId,
      "| Available productIds:",
      packages.map((p: any) => p.product?.identifier ?? "?")
    );
    throw new Error(`[IAP ERROR] Package not found for productId: ${productId}`);
  }

  console.log(
    "[IAP] Package found:",
    "pkgId=", pkg.identifier,
    "| productId=", pkg.product?.identifier,
    "| price=", pkg.product?.priceString
  );
  console.log("[IAP] Full package object:", JSON.stringify(pkg));

  // ── Trigger StoreKit purchase sheet ─────────────────────────────────────────
  console.log("[IAP] Calling purchasePackage...");
  let customerInfo: any;
  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    customerInfo = result.customerInfo;
  } catch (err: any) {
    console.error("[IAP] purchasePackage threw:", err?.message ?? err);
    console.error("[IAP] error.code:", err?.code);
    console.error("[IAP] error.underlyingErrorMessage:", err?.underlyingErrorMessage);
    console.error("[IAP] full error:", JSON.stringify(err));
    throw err;
  }

  console.log(
    "[IAP] Purchase response — entitlements.active:",
    Object.keys(customerInfo?.entitlements?.active ?? {})
  );

  let plan = planFromCustomerInfo(customerInfo);

  // Explicit fallback: if entitlements not yet reflected in customerInfo,
  // infer the plan from the product identifier.
  if (plan === "free") {
    const inferredPlan = planFromProductIdentifier(productId);
    if (inferredPlan) {
      console.warn(
        "[IAP] Entitlements not yet reflected — inferring plan from productId:",
        inferredPlan, "(productId:", productId + ")"
      );
      plan = inferredPlan;
    }
  }

  console.log("[IAP] Purchase complete → plan:", plan);
  return plan;
}

/**
 * Restore previous purchases (required by Apple App Store guidelines).
 * Returns the restored plan.
 */
export async function restorePurchases(): Promise<RCPlan> {
  if (!isNativeIOS()) throw new Error("[RC] restorePurchases is only available on iOS.");

  await waitForConfigured();
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  console.log("[RC] Restoring purchases...");

  const { customerInfo } = await Purchases.restorePurchases();

  console.log(
    "[RC] Restore response — entitlements.active:",
    Object.keys(customerInfo?.entitlements?.active ?? {})
  );

  const plan = planFromCustomerInfo(customerInfo);
  console.log("[RC] Restore complete → plan:", plan);
  return plan;
}

/**
 * Check the user's current subscription via RevenueCat entitlements.
 * Returns "free" on web or when no entitlement is active.
 */
export async function checkUserSubscription(): Promise<RCPlan> {
  if (!isNativeIOS()) return "free";

  try {
    await waitForConfigured();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();

    if (DEBUG_RC) {
      console.log(
        "[RC] getCustomerInfo — entitlements.active:",
        Object.keys(customerInfo?.entitlements?.active ?? {})
      );
    }

    const plan = planFromCustomerInfo(customerInfo);
    console.log("[RC] Current plan:", plan);
    return plan;
  } catch (error) {
    console.error("[RC] Failed to check subscription:", error);
    return "free";
  }
}
