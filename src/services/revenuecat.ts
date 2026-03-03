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
let _resolveConfigured: (() => void) | null = null;
const _configuredPromise: Promise<void> = new Promise<void>((resolve) => {
  _resolveConfigured = resolve;
});

function waitForConfigured(timeoutMs = 10_000): Promise<void> {
  if (_isConfigured) return Promise.resolve();
  return Promise.race([
    _configuredPromise,
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error("[RC] Init timeout — Purchases not configured yet")),
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

/** Package identifiers inside offering "default_v3". */
export const RC_PACKAGE_STARTER = "$rc_monthly";
export const RC_PACKAGE_PRO = "pro_monthly";

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
 * Explicit plan mapping from package identifier.
 * Used as fallback when entitlements are not yet reflected after purchase.
 */
function planFromPackageIdentifier(packageIdentifier: string): RCPlan | null {
  if (packageIdentifier === RC_PACKAGE_PRO) return "pro";
  if (packageIdentifier === RC_PACKAGE_STARTER) return "starter";
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize RevenueCat with the authenticated Supabase user ID.
 * Must be called once per session, after auth is confirmed.
 * No-op on web.
 */
export async function initRevenueCat(userId: string): Promise<void> {
  if (!isNativeIOS()) return;

  if (!RC_IOS_API_KEY || RC_IOS_API_KEY === "appl_REPLACE_ME") {
    console.error("[RC] NEXT_PUBLIC_REVENUECAT_IOS_KEY is not set.");
    return;
  }

  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");

    // Log a masked key so we can confirm the correct key is injected in production.
    const maskedKey =
      RC_IOS_API_KEY.length > 8
        ? RC_IOS_API_KEY.slice(0, 4) + "…" + RC_IOS_API_KEY.slice(-4)
        : "(too short)";
    console.log("[RC] Initializing. Key:", maskedKey, "| User:", userId);

    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: RC_IOS_API_KEY, appUserID: userId });

    _isConfigured = true;
    _resolveConfigured?.();

    console.log("[RC] Initialized successfully. User:", userId);
  } catch (error) {
    console.error("[RC] Failed to initialize:", error);
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
 * Purchase a package by its identifier (e.g. RC_PACKAGE_STARTER).
 * Returns the resulting plan on success.
 * Throws on user cancellation or payment error.
 *
 * Plan determination priority:
 *   1. RC entitlements from returned customerInfo (source of truth)
 *   2. Explicit package→plan mapping fallback if entitlements not yet reflected
 */
export async function purchasePackage(packageIdentifier: string): Promise<RCPlan> {
  if (!isNativeIOS()) throw new Error("[RC] purchasePackage is only available on iOS.");

  await waitForConfigured();
  const { Purchases } = await import("@revenuecat/purchases-capacitor");

  const result = await Purchases.getOfferings();
  // Mirror the same resolution logic as getOfferings(): current → all["default_v3"].
  const current = result.current ?? result.all?.[RC_OFFERING_TARGET] ?? null;
  if (!current) throw new Error("[RC] No offerings available");

  if (DEBUG_RC) {
    console.log(
      "[RC] purchasePackage — offering:", current.identifier,
      "| target package:", packageIdentifier,
      "| available:", current.availablePackages?.map((p: any) => p.identifier) ?? []
    );
  }

  const pkg = current.availablePackages?.find(
    (p: any) => p.identifier === packageIdentifier
  );
  if (!pkg) throw new Error(`[RC] Package not found: ${packageIdentifier}`);

  console.log("[RC] Starting purchase for:", packageIdentifier);
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });

  console.log(
    "[RC] Purchase response — entitlements.active:",
    Object.keys(customerInfo?.entitlements?.active ?? {})
  );

  let plan = planFromCustomerInfo(customerInfo);

  // Explicit fallback: if entitlements not yet reflected in customerInfo,
  // infer the plan from the package identifier (pro_monthly→pro, $rc_monthly→starter).
  if (plan === "free") {
    const inferredPlan = planFromPackageIdentifier(packageIdentifier);
    if (inferredPlan) {
      console.warn(
        "[RC] Entitlements not yet reflected — inferring plan from package:",
        inferredPlan,
        "(package:", packageIdentifier + ")"
      );
      plan = inferredPlan;
    }
  }

  console.log("[RC] Purchase complete → plan:", plan);
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
