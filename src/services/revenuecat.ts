/**
 * RevenueCat service — iOS in-app purchases only.
 *
 * All functions are no-ops (or throw) on web.
 * Use isNativeIOS() before calling any function in non-guarded contexts.
 *
 * Entitlements (must match RevenueCat dashboard):
 *   "starter"  → Starter plan
 *   "pro"      → Pro plan
 *
 * Package identifiers (default offering):
 *   "$rc_monthly"  → Starter
 *   "pro_monthly"  → Pro
 */

import { isNativeIOS } from "@/lib/native";

// ─── Constants ───────────────────────────────────────────────────────────────

const RC_IOS_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "";

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

/** Entitlement identifiers — must match RevenueCat dashboard exactly. */
export const RC_ENTITLEMENT_STARTER = "Starter";
export const RC_ENTITLEMENT_PRO = "Pro";

/** Package identifiers inside the default offering. */
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
 */
function planFromCustomerInfo(customerInfo: any): RCPlan {
  const active = customerInfo?.entitlements?.active ?? {};
  if (active[RC_ENTITLEMENT_PRO]) return "pro";
  if (active[RC_ENTITLEMENT_STARTER]) return "starter";
  return "free";
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
 * Returns null on web or if no offering is available.
 */
export async function getOfferings(): Promise<RCOffering | null> {
  if (!isNativeIOS()) return null;

  try {
    await waitForConfigured();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");

    let result = await Purchases.getOfferings();

    // Log the full offerings response for diagnostics.
    console.log("[RC] getOfferings response:", {
      current: result.current?.identifier ?? null,
      allOfferings: Object.keys(result.all ?? {}),
      currentPackages:
        result.current?.availablePackages?.map((p: any) => p.identifier) ?? [],
    });

    // If current is null, wait 2 s and retry once. This handles timing issues
    // where StoreKit hasn't finished loading products on the first call.
    if (!result.current) {
      console.warn("[RC] No current offering — retrying in 2 s…");
      await new Promise<void>((r) => setTimeout(r, 2000));
      result = await Purchases.getOfferings();
      console.log("[RC] getOfferings retry response:", {
        current: result.current?.identifier ?? null,
        allOfferings: Object.keys(result.all ?? {}),
        currentPackages:
          result.current?.availablePackages?.map((p: any) => p.identifier) ?? [],
      });
    }

    const current = result.current;

    if (!current) {
      console.warn(
        "[RC] Still no current offering after retry.",
        "All offerings in RC dashboard:",
        Object.keys(result.all ?? {})
      );
      return null;
    }

    console.log(
      "[RC] Current offering:",
      current.identifier,
      "| Packages:",
      current.availablePackages.map((p: any) => p.identifier)
    );

    return {
      identifier: current.identifier,
      serverDescription: current.serverDescription,
      availablePackages: current.availablePackages.map((pkg: any) => ({
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
 */
export async function purchasePackage(packageIdentifier: string): Promise<RCPlan> {
  if (!isNativeIOS()) throw new Error("[RC] purchasePackage is only available on iOS.");

  await waitForConfigured();
  const { Purchases } = await import("@revenuecat/purchases-capacitor");

  const result = await Purchases.getOfferings();
  const current = result.current;
  if (!current) throw new Error("[RC] No offerings available");

  const pkg = current.availablePackages.find(
    (p: any) => p.identifier === packageIdentifier
  );
  if (!pkg) throw new Error(`[RC] Package not found: ${packageIdentifier}`);

  console.log("[RC] Starting purchase for:", packageIdentifier);
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });

  const plan = planFromCustomerInfo(customerInfo);
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
    const plan = planFromCustomerInfo(customerInfo);
    console.log("[RC] Current plan:", plan);
    return plan;
  } catch (error) {
    console.error("[RC] Failed to check subscription:", error);
    return "free";
  }
}
