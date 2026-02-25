"use client";

/**
 * IOSPaywall — RevenueCat in-app purchase UI for iOS only.
 *
 * - Fetches live offerings (title, description, priceString) from RevenueCat
 * - Handles purchase of Starter and Pro packages
 * - Handles restore purchases (required by App Store guidelines)
 * - Syncs the resulting plan to Supabase via /api/revenuecat/sync-plan
 * - Never renders on web (returns null if not native iOS)
 *
 * Usage:
 *   <IOSPaywall onSuccess={(plan) => console.log("now on plan:", plan)} />
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Sparkles } from "lucide-react";
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

  // Guard: never render on web
  if (!isNativeIOS()) return null;

  const [state, setState] = useState<PaywallState>("loading");
  const [currentPlan, setCurrentPlan] = useState<RCPlan>("free");
  const [offering, setOffering] = useState<RCOffering | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadData() {
    try {
      setState("loading");
      setError(null);
      console.log("[IOSPaywall] Loading plan and offerings...");

      const { getOfferings } = await import("@/services/revenuecat");

      const [quotaRes, offeringData] = await Promise.all([
        fetch("/api/quota"),
        getOfferings(),
      ]);

      // Read plan from Supabase (source of truth — covers both Stripe and RC subscriptions)
      let plan: RCPlan = "free";
      if (quotaRes.ok) {
        const data = await quotaRes.json();
        const p = data.plan as string;
        if (p === "starter" || p === "pro") plan = p;
      }

      console.log(
        "[IOSPaywall] Plan (Supabase):",
        plan,
        "| Offering:",
        offeringData?.identifier ?? "none",
        "| Packages:",
        offeringData?.availablePackages.map((p) => p.identifier) ?? []
      );

      setCurrentPlan(plan);
      setOffering(offeringData);
      setState("ready");
    } catch (err) {
      console.error("[IOSPaywall] Load error:", err);
      setError(t("paywall.loadError"));
      setState("error");
    }
  }

  // ── Purchase ────────────────────────────────────────────────────────────────

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

  // ── Restore ─────────────────────────────────────────────────────────────────

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

  // ── Render helpers ──────────────────────────────────────────────────────────

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

  // ── JSX ─────────────────────────────────────────────────────────────────────

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

      {/* No offerings — shown after a successful load with no products */}
      {state === "ready" && !offering && currentPlan !== "pro" && (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          {t("paywall.noOfferings")}
        </div>
      )}

      {/* Plans — shown when offering is available and not already Pro */}
      {state !== "loading" && offering && currentPlan !== "pro" && (
        <div className="space-y-3">
          {/* ── Starter (only if currently free) ── */}
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

          {/* ── Pro ── */}
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

          {/* Restore purchases */}
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

      {/* Already on Pro */}
      {state !== "loading" && currentPlan === "pro" && (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          {t("paywall.alreadyPro")}
        </div>
      )}
    </div>
  );
}

// ─── Supabase sync (module-level, not a hook) ─────────────────────────────────

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
