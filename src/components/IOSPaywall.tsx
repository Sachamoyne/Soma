"use client";

/**
 * IOSPaywall — RevenueCat in-app purchase UI for iOS only.
 *
 * Source of truth: RevenueCat CustomerInfo (read directly via SDK).
 * Supabase is a mirror, synced in background after every RC read.
 *
 * - Reads current plan from RevenueCat (not Supabase) → eliminates race condition
 * - Refreshes on foreground resume (visibilitychange) → picks up external changes
 * - Handles purchase of Starter and Pro packages
 * - Handles restore purchases (required by App Store guidelines)
 * - Shows "Manage subscription" button for paid plans (opens App Store)
 * - Syncs plan to Supabase in background via /api/revenuecat/sync-plan
 * - Never renders on web (returns null if not native iOS)
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Sparkles, ExternalLink } from "lucide-react";
import {
  RC_PACKAGE_STARTER,
  RC_PACKAGE_PRO,
  type RCOffering,
  type RCPlan,
} from "@/services/revenuecat";
import { isNativeIOS } from "@/lib/native";
import { useTranslation } from "@/i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

type PaywallState =
  | "loading"
  | "ready"
  | "purchasing"
  | "restoring"
  | "success"
  | "error";

interface IOSPaywallProps {
  /** Called after a successful purchase or restore (not called on cancel/error). */
  onSuccess?: (plan: RCPlan) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IOSPaywall({ onSuccess }: IOSPaywallProps) {
  const { t } = useTranslation();

  // ALL hooks must be called before any conditional return (React rules of hooks).
  const [state, setState] = useState<PaywallState>("loading");
  const [currentPlan, setCurrentPlan] = useState<RCPlan>("free");
  const [offering, setOffering] = useState<RCOffering | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Initial load
  useEffect(() => {
    if (!isNativeIOS()) return;
    void loadData();
  }, []);

  // Refresh on foreground resume — picks up subscription changes made outside
  // the app (e.g. user managed subscription in iOS Settings / App Store).
  useEffect(() => {
    if (!isNativeIOS()) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Guard: never render on web (all hooks above are already no-ops on web)
  if (!isNativeIOS()) return null;

  // ── Data loading ─────────────────────────────────────────────────────────────
  //
  // Source of truth: RevenueCat CustomerInfo (real-time from Apple).
  // checkUserSubscription() internally calls waitForConfigured(), so it will
  // wait for useRevenueCat's initRevenueCat() to complete if needed.

  async function loadData() {
    if (loadingRef.current) return; // prevent concurrent calls
    loadingRef.current = true;

    try {
      setState("loading");
      setError(null);

      const { getOfferings, checkUserSubscription } = await import(
        "@/services/revenuecat"
      );

      // Read from RevenueCat directly — eliminates Supabase race condition
      const [rcPlan, offeringData] = await Promise.all([
        checkUserSubscription(),
        getOfferings(),
      ]);

      console.log(
        "[IOSPaywall] RC plan:",
        rcPlan,
        "| Offering:",
        offeringData?.identifier ?? "none",
        "| Packages:",
        offeringData?.availablePackages.map((p) => p.identifier) ?? []
      );

      setCurrentPlan(rcPlan);
      setOffering(offeringData);
      setState("ready");

      // If no offering came back (RC returned null), schedule one more silent
      // retry after 5 s. StoreKit sometimes needs extra time to warm up,
      // especially in sandbox / first launch. The RC service already does a
      // 2 s internal retry; this gives an additional chance at the UI level.
      if (!offeringData) {
        console.warn("[IOSPaywall] No offering — scheduling auto-retry in 5 s");
        setTimeout(() => {
          if (!loadingRef.current) void loadData();
        }, 5000);
      }

      // Sync to Supabase in background (non-blocking)
      void syncPlan(rcPlan);
    } catch (err) {
      console.error("[IOSPaywall] Load error:", err);
      setError(t("paywall.loadError"));
      setState("error");
    } finally {
      loadingRef.current = false;
    }
  }

  // ── Purchase ─────────────────────────────────────────────────────────────────

  async function handlePurchase(packageIdentifier: string) {
    try {
      setState("purchasing");
      setError(null);
      setSuccessMsg(null);
      console.log("[IOSPaywall] Starting purchase:", packageIdentifier);

      const { purchasePackage } = await import("@/services/revenuecat");
      const newPlan = await purchasePackage(packageIdentifier);

      console.log("[IOSPaywall] Purchase success → plan:", newPlan);
      await syncPlan(newPlan);
      setCurrentPlan(newPlan);

      const label = newPlan === "pro" ? "Pro" : "Starter";
      setSuccessMsg(t("paywall.activatedTemplate", { label }));
      setState("success");
      onSuccess?.(newPlan);
    } catch (err: any) {
      // Apple cancellation — not an error, just go back to ready
      const cancelled =
        err?.code === "PURCHASE_CANCELLED" ||
        String(err?.message ?? "").toLowerCase().includes("cancel");

      if (cancelled) {
        console.log("[IOSPaywall] Purchase cancelled by user");
        setState("ready");
      } else {
        console.error("[IOSPaywall] Purchase error:", err);
        setError(t("paywall.purchaseError"));
        setState("error");
      }
    }
  }

  // ── Restore ──────────────────────────────────────────────────────────────────

  async function handleRestore() {
    try {
      setState("restoring");
      setError(null);
      setSuccessMsg(null);
      console.log("[IOSPaywall] Restoring purchases...");

      const { restorePurchases } = await import("@/services/revenuecat");
      const restoredPlan = await restorePurchases();

      console.log("[IOSPaywall] Restore complete → plan:", restoredPlan);
      await syncPlan(restoredPlan);
      setCurrentPlan(restoredPlan);

      if (restoredPlan === "free") {
        setSuccessMsg(t("paywall.noRestoredPurchases"));
        setState("ready");
      } else {
        const label = restoredPlan === "pro" ? "Pro" : "Starter";
        setSuccessMsg(t("paywall.restoredTemplate", { label }));
        setState("success");
        onSuccess?.(restoredPlan);
      }
    } catch (err) {
      console.error("[IOSPaywall] Restore error:", err);
      setError(t("paywall.restoreError"));
      setState("error");
    }
  }

  // ── Manage subscription ──────────────────────────────────────────────────────
  //
  // Opens iOS App Store subscription management.
  // Capacitor's WKWebView delegates non-HTTP/HTTPS URLs to UIApplication.openURL,
  // which opens the App Store on the subscriptions page.

  function handleManageSubscription() {
    window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const starterPkg = offering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_STARTER
  );
  const proPkg = offering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_PRO
  );

  const isBusy =
    state === "loading" ||
    state === "purchasing" ||
    state === "restoring";

  const planLabel =
    currentPlan === "pro"
      ? "Pro"
      : currentPlan === "starter"
      ? "Starter"
      : t("paywall.planFree");

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Current plan badge */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("paywall.currentPlan")} :</span>
        <span className="font-semibold">{planLabel}</span>
        {isBusy && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Success feedback */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Error feedback */}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <p>{error}</p>
          {state === "error" && (
            <button
              className="mt-1.5 text-xs underline underline-offset-2"
              onClick={() => void loadData()}
            >
              {t("paywall.retry")}
            </button>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {state === "loading" && (
        <div className="space-y-3">
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
          <div className="h-[88px] animate-pulse rounded-xl bg-muted" />
        </div>
      )}

      {/* ── Pro plan: show managed state ── */}
      {state !== "loading" && currentPlan === "pro" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            {t("paywall.alreadyPro")}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={handleManageSubscription}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t("paywall.manageSubscription")}
          </Button>
        </div>
      )}

      {/* ── Upgrade options: shown for free and starter plans ── */}
      {state !== "loading" && offering && currentPlan !== "pro" && (
        <div className="space-y-3">
          {/* Starter — only shown when currently free */}
          {currentPlan === "free" && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div>
                <p className="font-semibold text-sm leading-tight">
                  {starterPkg?.product.title ?? "Starter"}
                </p>
                {starterPkg && (
                  <p className="mt-0.5 text-sm font-semibold">
                    {starterPkg.product.priceString}
                    <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                      {t("paywall.perMonth")}
                    </span>
                  </p>
                )}
                {starterPkg?.product.description ? (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {starterPkg.product.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("paywall.starterFallbackDesc")}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={isBusy}
                onClick={() => void handlePurchase(RC_PACKAGE_STARTER)}
              >
                {state === "purchasing" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("paywall.purchasing")}
                  </>
                ) : (
                  t("paywall.chooseStarter")
                )}
              </Button>
            </div>
          )}

          {/* Pro */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="font-semibold text-sm leading-tight">
                  {proPkg?.product.title ?? "Pro"}
                </p>
              </div>
              {proPkg && (
                <p className="mt-0.5 text-sm font-semibold">
                  {proPkg.product.priceString}
                  <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                    {t("paywall.perMonth")}
                  </span>
                </p>
              )}
              {proPkg?.product.description ? (
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {proPkg.product.description}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("paywall.proFallbackDesc")}
                </p>
              )}
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={isBusy}
              onClick={() => void handlePurchase(RC_PACKAGE_PRO)}
            >
              {state === "purchasing" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("paywall.purchasing")}
                </>
              ) : currentPlan === "starter" ? (
                t("paywall.upgradeToPro")
              ) : (
                t("paywall.choosePro")
              )}
            </Button>
          </div>

          {/* Manage subscription — for Starter plan (already paying) */}
          {currentPlan === "starter" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={handleManageSubscription}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {t("paywall.manageSubscription")}
            </Button>
          )}

          {/* Restore purchases — required by App Store guidelines */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            disabled={isBusy}
            onClick={() => void handleRestore()}
          >
            {state === "restoring" ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {t("paywall.restoring")}
              </>
            ) : (
              t("paywall.restore")
            )}
          </Button>

          {/* Legal disclaimer — required by App Store */}
          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legal")}
          </p>
        </div>
      )}

      {/* No offerings available (RC configured but no products returned) */}
      {state === "ready" &&
        !offering &&
        currentPlan !== "pro" &&
        currentPlan !== "starter" && (
          <div className="space-y-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              {t("paywall.noOfferings")}
            </div>
            <button
              className="w-full text-xs underline underline-offset-2 text-muted-foreground py-1"
              onClick={() => void loadData()}
            >
              {t("paywall.retry")}
            </button>
          </div>
        )}
    </div>
  );
}

// ─── Supabase sync (module-level, not a hook) ─────────────────────────────────
//
// Syncs the RC-determined plan to Supabase so server-side features (quotas,
// AI card limits) reflect the current subscription. Non-blocking — UI never
// waits for this.

async function syncPlan(plan: RCPlan): Promise<void> {
  try {
    const res = await fetch("/api/revenuecat/sync-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("[IOSPaywall] Supabase synced →", data.plan ?? plan);
    } else {
      console.error(
        "[IOSPaywall] sync-plan error:",
        res.status,
        await res.text()
      );
    }
  } catch (err) {
    console.error("[IOSPaywall] sync-plan fetch failed:", err);
  }
}
