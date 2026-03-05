"use client";

/**
 * IOSPaywall — StoreKit 2 in-app purchase UI for iOS only.
 *
 * Never renders on web (returns null if not native iOS).
 *
 * State design — three independent concerns, never a single global machine:
 *   purchasing  : which plan button is mid-purchase ("starter" | "pro" | null)
 *   restoring   : restore button in progress
 *   error       : set ONLY by purchase/restore failures, never by background fetch
 *
 * Background product fetch (loadData) is fully silent:
 *   - No spinner shown at mount
 *   - No error/retry shown if StoreKit times out
 *   - Fallback plans are always visible; real plans replace them if SK responds
 * Spinner next to plan badge appears ONLY during an active purchase or restore.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Sparkles, ExternalLink } from "lucide-react";
import {
  SK_PRODUCT_STARTER,
  SK_PRODUCT_PRO,
  type SKProduct,
  type SKPlan,
} from "@/services/storekit";
import { isNativeIOS } from "@/lib/native";
import { useTranslation } from "@/i18n";

// ─── Fallback plans ───────────────────────────────────────────────────────────
//
// Shown immediately on mount and whenever RC offerings are unavailable.
// Replaced silently by real RC data as soon as getOfferings() succeeds.

const FALLBACK_PLANS = [
  {
    id: "starter" as const,
    productId: SK_PRODUCT_STARTER,
    title: "Soma Starter",
    priceString: "€2.99",
    description: "Access up to 200 AI-generated flashcards per month.",
  },
  {
    id: "pro" as const,
    productId: SK_PRODUCT_PRO,
    title: "Soma Pro",
    priceString: "€7.99",
    description: "Unlimited AI-generated flashcards.",
  },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface IOSPaywallProps {
  onSuccess?: (plan: SKPlan) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IOSPaywall({ onSuccess }: IOSPaywallProps) {
  const { t } = useTranslation();

  // ── State — three independent axes, never a single machine ─────────────────
  const [currentPlan, setCurrentPlan] = useState<SKPlan>("free");
  const [products, setProducts]       = useState<SKProduct[] | null>(null);
  const [purchasing, setPurchasing]     = useState<"starter" | "pro" | null>(null);
  const [restoring, setRestoring]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const [purchaseAttempted, setPurchaseAttempted] = useState(false);

  const loadingRef     = useRef(false);
  const autoRetriedRef = useRef(false);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isNativeIOS()) return;
    void loadData();
  }, []);

  useEffect(() => {
    if (!isNativeIOS()) return;
    const handle = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  // Guard: never render on web
  if (!isNativeIOS()) return null;

  // ── StoreKit background fetch ─────────────────────────────────────────────
  //
  // Fully silent: no state changes that affect the visible UI before or after.
  // Plans (fallback or real) are always visible regardless of this fetch.
  // Errors here are logged only — never surfaced to the user.

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    // Clear any previous purchase/restore error so a manual retry feels clean.
    setError(null);

    try {
      const { loadProducts, checkCurrentPlan } = await import("@/services/storekit");

      const [skPlan, skProducts] = await Promise.all([
        checkCurrentPlan(),
        loadProducts(),
      ]);

      console.log(
        "[IOSPaywall] plan:", skPlan,
        "| products:", skProducts.map((p) => `${p.productId} ${p.priceString}`)
      );

      setCurrentPlan(skPlan);
      setProducts(skProducts.length > 0 ? skProducts : null);

      if (skProducts.length === 0) {
        console.warn("[SK] No products returned — using fallback prices");
        if (!autoRetriedRef.current) {
          autoRetriedRef.current = true;
          console.warn("[IOSPaywall] scheduling one-time auto-retry in 5 s");
          setTimeout(() => {
            if (!loadingRef.current) void loadData();
          }, 5000);
        }
      }

      void syncPlan(skPlan);
    } catch (err: any) {
      // Silent fail — StoreKit errors during background fetch do not surface to the user.
      // Fallback plans remain visible; the user can tap Retry in the fallback section.
      console.error("[IOSPaywall] loadData error:", err);
    } finally {
      loadingRef.current = false;
    }
  }

  // ── Purchase ──────────────────────────────────────────────────────────────
  //
  // Only the clicked plan's button is disabled/spinning.
  // The rest of the UI is never touched.

  async function handlePurchase(productId: string, planId: "starter" | "pro") {
    console.log("[IAP BUTTON TAPPED] planId:", planId, "| productId:", productId);

    setPurchaseAttempted(true);
    setPurchasing(planId);
    setError(null);
    setSuccessMsg(null);

    try {
      const { purchaseProduct } = await import("@/services/storekit");
      const result = await purchaseProduct(productId);

      console.log("[IAP] Purchase success → plan:", result.plan);
      void syncPlan(result.plan);
      setCurrentPlan(result.plan);
      const label = result.plan === "pro" ? "Pro" : "Starter";
      setSuccessMsg(t("paywall.activatedTemplate", { label }));
      onSuccess?.(result.plan);
    } catch (err: any) {
      console.error("[IAP] Purchase threw. message:", err?.message);
      console.error("[IAP] full error JSON:", JSON.stringify(err));

      const cancelled =
        err?.message === "PURCHASE_CANCELLED" ||
        String(err?.message ?? "").toLowerCase().includes("cancel");

      if (cancelled) {
        console.log("[IAP] Purchase cancelled by user");
      } else {
        setError(t("paywall.purchaseError"));
      }
    } finally {
      setPurchasing(null);
    }
  }

  // ── Restore ───────────────────────────────────────────────────────────────

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    setSuccessMsg(null);
    console.log("[IOSPaywall] Restoring purchases...");

    try {
      const { restorePurchases } = await import("@/services/storekit");
      const result = await restorePurchases();

      console.log("[IOSPaywall] Restore complete → plan:", result.plan);
      void syncPlan(result.plan);
      setCurrentPlan(result.plan);

      if (result.plan === "free") {
        setSuccessMsg(t("paywall.noRestoredPurchases"));
      } else {
        const label = result.plan === "pro" ? "Pro" : "Starter";
        setSuccessMsg(t("paywall.restoredTemplate", { label }));
        onSuccess?.(result.plan);
      }
    } catch (err) {
      console.error("[IOSPaywall] Restore error:", err);
      setError(t("paywall.restoreError"));
    } finally {
      setRestoring(false);
    }
  }

  // ── Manage subscription ───────────────────────────────────────────────────

  function handleManageSubscription() {
    window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const anyActionInProgress = purchasing !== null || restoring;

  // Real StoreKit products (null until loadProducts() responds)
  const starterProduct = products?.find((p) => p.productId === SK_PRODUCT_STARTER) ?? null;
  const proProduct     = products?.find((p) => p.productId === SK_PRODUCT_PRO) ?? null;

  // Use fallback when SK products are not yet loaded
  const hasRealProducts   = products !== null && products.length > 0;
  const showUpgradeSection = currentPlan !== "pro";
  const usingFallback     = showUpgradeSection && !hasRealProducts;

  const planLabel =
    currentPlan === "pro"
      ? "Pro"
      : currentPlan === "starter"
      ? "Starter"
      : t("paywall.planFree");

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Current plan + discrete RC loading indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("paywall.currentPlan")} :</span>
        <span className="font-semibold">{planLabel}</span>
        {(purchasing !== null || restoring) && (
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
          <button
            className="mt-1.5 text-xs underline underline-offset-2"
            onClick={() => void loadData()}
          >
            {t("paywall.retry")}
          </button>
        </div>
      )}

      {/* ── Pro: already subscribed ── */}
      {currentPlan === "pro" && (
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

      {/* ── Upgrade section: real StoreKit products ── */}
      {showUpgradeSection && hasRealProducts && (
        <div className="space-y-3">

          {/* Starter — only for free plan */}
          {currentPlan === "free" && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div>
                <p className="font-semibold text-sm leading-tight">
                  {starterProduct?.title ?? "Soma Starter"}
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {starterProduct?.priceString ?? FALLBACK_PLANS[0].priceString}
                  <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                    {t("paywall.perMonth")}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {starterProduct?.description ?? t("paywall.starterFallbackDesc")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={anyActionInProgress}
                onClick={() => void handlePurchase(SK_PRODUCT_STARTER, "starter")}
              >
                {purchasing === "starter" ? (
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
                  {proProduct?.title ?? "Soma Pro"}
                </p>
              </div>
              <p className="mt-0.5 text-sm font-semibold">
                {proProduct?.priceString ?? FALLBACK_PLANS[1].priceString}
                <span className="ml-0.5 font-normal text-xs text-muted-foreground">
                  {t("paywall.perMonth")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {proProduct?.description ?? t("paywall.proFallbackDesc")}
              </p>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={anyActionInProgress}
              onClick={() => void handlePurchase(SK_PRODUCT_PRO, "pro")}
            >
              {purchasing === "pro" ? (
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

          {/* Manage — for Starter subscribers */}
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

          {/* Legal links — Apple Guideline 3.1.2(c) */}
          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legalPrefix")}{" "}
            <button
              className="underline"
              onClick={() => window.open("https://soma-edu.com/terms", "_system")}
            >
              {t("paywall.legalTerms")}
            </button>
            {" "}{t("paywall.legalAnd")}{" "}
            <button
              className="underline"
              onClick={() => window.open("https://soma-edu.com/privacy", "_system")}
            >
              {t("paywall.legalPrivacy")}
            </button>
            .
          </p>

          {/* Restore */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            disabled={anyActionInProgress}
            onClick={() => void handleRestore()}
          >
            {restoring ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {t("paywall.restoring")}
              </>
            ) : (
              t("paywall.restore")
            )}
          </Button>

          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legal")}
          </p>
        </div>
      )}

      {/* ── Upgrade section: fallback (RC not loaded yet or unavailable) ──
           Visible immediately on mount. Replaced silently by real offering above
           once getOfferings() returns data. Purchase buttons are fully functional —
           purchasePackage() fetches offerings fresh at tap time.
      ── */}
      {usingFallback && (
        <div className="space-y-3">

          {/* Subtle Preview badge + manual retry (only after a failed purchase attempt) */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-400/30">
              Preview
            </span>
            {purchaseAttempted && error !== null && (
              <button
                className="text-xs underline underline-offset-2 text-muted-foreground"
                onClick={() => void loadData()}
              >
                {t("paywall.retry")}
              </button>
            )}
          </div>

          {/* Starter fallback — only for free plan */}
          {currentPlan === "free" && (
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
                disabled={anyActionInProgress}
                onClick={() => void handlePurchase(SK_PRODUCT_STARTER, "starter")}
              >
                {t("paywall.chooseStarter")}
              </Button>
            </div>
          )}

          {/* Pro fallback */}
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
              disabled={anyActionInProgress}
              onClick={() => void handlePurchase(SK_PRODUCT_PRO, "pro")}
            >
              {currentPlan === "starter"
                ? t("paywall.upgradeToPro")
                : t("paywall.choosePro")}
            </Button>
          </div>

          {/* Manage — for Starter subscribers in fallback mode */}
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

          {/* Legal links — Apple Guideline 3.1.2(c) */}
          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legalPrefix")}{" "}
            <button
              className="underline"
              onClick={() => window.open("https://soma-edu.com/terms", "_system")}
            >
              {t("paywall.legalTerms")}
            </button>
            {" "}{t("paywall.legalAnd")}{" "}
            <button
              className="underline"
              onClick={() => window.open("https://soma-edu.com/privacy", "_system")}
            >
              {t("paywall.legalPrivacy")}
            </button>
            .
          </p>

          {/* Restore */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            disabled={anyActionInProgress}
            onClick={() => void handleRestore()}
          >
            {restoring ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {t("paywall.restoring")}
              </>
            ) : (
              t("paywall.restore")
            )}
          </Button>

          <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("paywall.legal")}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Supabase sync ────────────────────────────────────────────────────────────

async function syncPlan(plan: SKPlan): Promise<void> {
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
      console.error("[IOSPaywall] sync-plan error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[IOSPaywall] sync-plan fetch failed:", err);
  }
}
