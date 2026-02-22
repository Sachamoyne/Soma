"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_URL } from "@/lib/backend";
import { useTranslation } from "@/i18n";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";
import { IOSPaywall } from "@/components/IOSPaywall";

type Plan = "free" | "starter" | "pro";

// ─── Web billing (Stripe) ────────────────────────────────────────────────────

function WebBillingSection() {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);

  const [plan, setPlan] = useState<Plan>("free");
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingCheckout, setLoadingCheckout] = useState<"starter" | "pro" | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      try {
        setLoadingPlan(true);
        setError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setPlan("free"); setStripeCustomerId(null); }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_name, plan, stripe_customer_id")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        const planName = (profile as any)?.plan_name as string | null | undefined;
        const planFallback = (profile as any)?.plan as string | null | undefined;
        const resolved: Plan =
          planName === "starter" || planName === "pro" || planName === "free" ? planName
          : planFallback === "starter" || planFallback === "pro" || planFallback === "free" ? planFallback
          : "free";

        setPlan(resolved);
        setStripeCustomerId((profile as any)?.stripe_customer_id ?? null);
      } catch (e) {
        console.error("[billing] Failed to load plan:", e);
        if (!cancelled) setError(t("billing.loadError"));
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    }

    void loadPlan();
    return () => { cancelled = true; };
  }, [supabase, t]);

  const handleOpenPortal = useCallback(async () => {
    try {
      if (plan === "free" || !stripeCustomerId) {
        setError(t("billing.noActiveSubscription"));
        return;
      }
      setOpeningPortal(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(t("billing.authError")); return; }

      const res = await fetch(`${BACKEND_URL}/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const payload = await res.json() as { url?: string; message?: string };
      if (!res.ok || !payload.url) { setError(payload.message || t("billing.portalError")); return; }

      window.location.href = payload.url;
    } catch (e) {
      console.error("[billing] Portal error:", e);
      setError(t("billing.portalError"));
    } finally {
      setOpeningPortal(false);
    }
  }, [plan, stripeCustomerId, supabase, t]);

  const handleStartCheckout = useCallback(async (targetPlan: "starter" | "pro") => {
    try {
      setLoadingCheckout(targetPlan);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(t("billing.authError")); return; }

      const res = await fetch(`${BACKEND_URL}/stripe/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const payload = await res.json() as { url?: string; error?: string; message?: string };
      if (!res.ok || !payload.url) {
        setError(payload.error || payload.message || "Unable to start Stripe checkout.");
        return;
      }

      window.location.href = payload.url;
    } catch (e) {
      console.error("[billing] Checkout error:", e);
      setError("Unable to start Stripe checkout.");
    } finally {
      setLoadingCheckout(null);
    }
  }, [supabase, t]);

  const planLabel = plan === "pro" ? "Pro" : plan === "starter" ? "Starter" : t("pricing.free");
  const canOpenPortal = plan !== "free" && Boolean(stripeCustomerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("billing.currentPlan")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {loadingPlan ? t("common.loading") : planLabel}
        </p>

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => void handleStartCheckout("starter")}
              disabled={loadingCheckout !== null || plan === "starter"}
              className="w-full sm:w-auto"
            >
              {loadingCheckout === "starter"
                ? t("billing.redirecting")
                : plan === "starter"
                ? t("billing.starterActive")
                : t("billing.upgradeToStarter")}
            </Button>
            <Button
              onClick={() => void handleStartCheckout("pro")}
              disabled={loadingCheckout !== null || plan === "pro"}
              className="w-full sm:w-auto"
            >
              {loadingCheckout === "pro"
                ? t("billing.redirecting")
                : plan === "pro"
                ? t("billing.proActive")
                : t("billing.upgradeToPro")}
            </Button>
          </div>
          <Button
            onClick={handleOpenPortal}
            disabled={openingPortal || !canOpenPortal}
            className="w-full sm:w-auto"
          >
            {openingPortal ? t("billing.openingPortal") : t("billing.manageSubscription")}
          </Button>
          {!canOpenPortal && (
            <p className="text-xs text-muted-foreground max-w-prose">
              {t("billing.noActiveSubscription")}
            </p>
          )}
          {canOpenPortal && (
            <p className="text-xs text-muted-foreground max-w-prose">
              {t("billing.portalHelp")}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ─── iOS billing (RevenueCat via IOSPaywall) ─────────────────────────────────

function IOSBillingSection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("billing.subscriptionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <IOSPaywall
          onSuccess={(plan) => {
            console.log("[billing] iOS subscription activated:", plan);
          }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { t } = useTranslation();
  const isNativeIOS = useIsNativeIOS();

  return (
    <>
      <Topbar title={t("billing.title")} />
      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          {isNativeIOS ? <IOSBillingSection /> : <WebBillingSection />}
        </div>
      </div>
    </>
  );
}
