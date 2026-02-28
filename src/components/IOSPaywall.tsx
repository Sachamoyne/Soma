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

// ─── Fallback mock plans ─────────────────────────────────────────────────────
//
// Displayed ONLY when RevenueCat returns null offerings (StoreKit not ready,
// sandbox timing issues, or RC dashboard misconfiguration).
// Purchases are disabled in this mode — buttons are visible for screenshots /
// App Review but cannot be tapped to initiate a real StoreKit transaction.
// As soon as getOfferings() returns real data these are never rendered.

const FALLBACK_PLANS = [
  {
    id: "starter" as const,
    title: "Soma Starter",
    priceString: "€2.49",
    description: "Access up to 200 AI-generated flashcards per month.",
  },
  {
    id: "pro" as const,
    title: "Soma Pro",
    priceString: "€7.99",
    description: "Unlimited AI-generated flashcards.",
  },
] as const;

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
  const autoRetriedRef = useRef(false); // ensures the 5 s auto-retry fires at most once

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
        console.warn("[RC] Using fallback mock offerings");
        // Auto-retry fires at most ONCE (guard via autoRetriedRef).
        // Without this guard every failed load reschedules itself → infinite loop.
        if (!autoRetriedRef.current) {
          autoRetriedRef.current = true;
          console.warn("[IOSPaywall] No offering — scheduling one-time auto-retry in 5 s");
          setTimeout(() => {
            if (!loadingRef.current) void loadData();
          }, 5000);
        }
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

  // True when RC returned no offerings AND the user hasn't already paid.
  // Drives the fallback UI; automatically false once real offerings arrive.
  const usingFallback =
    state === "ready" &&
    (!offering || offering.availablePackages.length === 0) &&
    currentPlan !== "pro" &&
    currentPlan !== "starter";

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

      {/* ── Fallback plans (RC offerings unavailable) ───────────────────────────
           Shown when getOfferings() returns null. Purchase buttons are visible
           but disabled — this satisfies App Review screenshot requirements and
           gives the reviewer something to see even in sandbox edge-cases.
           Automatically hidden once real offerings load (usingFallback → false).
      ── */}
      {usingFallback && (
        <div className="space-y-3">

          {/* Preview Mode badge + retry link */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-400/30">
              Preview
            </span>
            <button
              className="text-xs underline underline-offset-2 text-muted-foreground"
              onClick={() => void loadData()}
            >
              {t("paywall.retry")}
            </button>
          </div>

          {/* Starter fallback card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm leading-tight">
                {FALLBACK_PLANS[0].title}
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {FALLBACK_PLANS[0].priceString}
                <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                  {t("paywall.perMonth")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {FALLBACK_PLANS[0].description}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={() => void handlePurchase(RC_PACKAGE_STARTER)}
            >
              {t("paywall.chooseStarter")}
            </Button>
          </div>

          {/* Pro fallback card */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="font-semibold text-sm leading-tight">
                  {FALLBACK_PLANS[1].title}
                </p>
              </div>
              <p className="mt-0.5 text-sm font-semibold">
                {FALLBACK_PLANS[1].priceString}
                <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                  {t("paywall.perMonth")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {FALLBACK_PLANS[1].description}
              </p>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={isBusy}
              onClick={() => void handlePurchase(RC_PACKAGE_PRO)}
            >
              {t("paywall.choosePro")}
            </Button>
          </div>

          {/* Restore — still functional; doesn't require offerings.
               state is always "ready" here (usingFallback requires it),
               so no spinner branch needed — restoring immediately exits this block. */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => void handleRestore()}
          >
            {t("paywall.restore")}
          </Button>

          {/* Legal disclaimer — required by App Store */}
          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legal")}
          </p>
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
