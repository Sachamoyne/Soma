"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_URL } from "@/lib/backend";
import { useTranslation } from "@/i18n";
import { useIsApp } from "@/hooks/useIsApp";

type Plan = "free" | "starter" | "pro";

export default function BillingPage() {
  const { t } = useTranslation();
  const isApp = useIsApp();
  const supabase = useMemo(() => createClient(), []);

  const [plan, setPlan] = useState<Plan>("free");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      try {
        setLoadingPlan(true);
        setError(null);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setPlan("free");
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_name, plan")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        const planName = (profile as any)?.plan_name as string | null | undefined;
        const planFallback = (profile as any)?.plan as string | null | undefined;
        const resolved: Plan =
          planName === "starter" || planName === "pro" || planName === "free"
            ? planName
            : planFallback === "starter" || planFallback === "pro" || planFallback === "free"
              ? planFallback
              : "free";

        setPlan(resolved);
      } catch (e) {
        console.error("[billing] Failed to load plan:", e);
        if (!cancelled) {
          setError(t("billing.loadError"));
        }
      } finally {
        if (!cancelled) {
          setLoadingPlan(false);
        }
      }
    }

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [supabase, t]);

  const handleOpenPortal = useCallback(async () => {
    try {
      setOpeningPortal(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError(t("billing.authError"));
        return;
      }

      const res = await fetch(`${BACKEND_URL}/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const payload = (await res.json()) as { url?: string; message?: string };

      if (!res.ok || !payload.url) {
        setError(payload.message || t("billing.portalError"));
        return;
      }

      window.location.href = payload.url;
    } catch (e) {
      console.error("[billing] Failed to open Stripe portal:", e);
      setError(t("billing.portalError"));
    } finally {
      setOpeningPortal(false);
    }
  }, [supabase, t]);

  const planLabel =
    plan === "pro" ? "Pro" : plan === "starter" ? "Starter" : t("pricing.free");

  return (
    <>
      <Topbar title={t("billing.title")} />
      <div className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("billing.currentPlan")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {loadingPlan ? t("common.loading") : planLabel}
              </p>

              {isApp ? (
                <p className="text-sm text-muted-foreground">
                  {t("billing.appModeNotice")}
                </p>
              ) : (
                <div className="space-y-2">
                  <Button onClick={handleOpenPortal} disabled={openingPortal} className="w-full sm:w-auto">
                    {openingPortal ? t("billing.openingPortal") : t("billing.manageSubscription")}
                  </Button>
                  <p className="text-xs text-muted-foreground max-w-prose">
                    {t("billing.portalHelp")}
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

