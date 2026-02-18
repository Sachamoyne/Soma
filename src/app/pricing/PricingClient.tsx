"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";
import { NativeIOSSubscriptionsBlocked } from "@/components/NativeIOSSubscriptionsBlocked";
import { BACKEND_URL } from "@/lib/backend";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function PricingClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const nativeIOS = useIsNativeIOS();

  const [userId, setUserId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<"free" | "starter" | "pro">("free");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState<"starter" | "pro" | null>(null);

  const startCheckout = useCallback(async (plan: "starter" | "pro") => {
    setLoadingCheckout(plan);
    try {
      let accessToken: string | null = null;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? null;

      if (!accessToken) {
        throw new Error("Authenticated session required to start checkout");
      }

      const res = await fetch(`${BACKEND_URL}/stripe/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan }),
      });

      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        throw new Error(payload.error || "Stripe checkout failed");
      }

      window.location.href = payload.url;
    } catch (error) {
      console.error("[pricing] Failed to start checkout:", error);
    } finally {
      setLoadingCheckout(null);
    }
  }, [supabase]);

  useEffect(() => {
    if (nativeIOS) return;
    let cancelled = false;

    async function loadUserAndPlan() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;
        setUserId(user?.id ?? null);

        if (!user) return;

        // Pull current subscription plan from profile (webhook updates plan_name)
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_name, subscription_status, plan")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        const planName = (profile as any)?.plan_name as string | null | undefined;
        const planFallback = (profile as any)?.plan as string | null | undefined;
        const resolved =
          planName === "starter" || planName === "pro" || planName === "free"
            ? planName
            : planFallback === "starter" || planFallback === "pro" || planFallback === "free"
              ? planFallback
              : "free";

        setCurrentPlan(resolved as "free" | "starter" | "pro");
        setSubscriptionStatus((profile as any)?.subscription_status ?? null);
      } catch (e) {
        console.error("[pricing] Failed to load user/profile:", e);
      }
    }

    void loadUserAndPlan();
    return () => {
      cancelled = true;
    };
  }, [nativeIOS, supabase]);

  if (nativeIOS) {
    return <NativeIOSSubscriptionsBlocked continueHref="/decks" />;
  }

  const handleSubscribeClick = (plan: "starter" | "pro") => {
    const isAlreadyOnPlan = userId && currentPlan === plan && subscriptionStatus === "active";
    if (isAlreadyOnPlan) return;
    if (!userId) {
      router.push(`/signup?intent=${plan}`);
      return;
    }
    void startCheckout(plan);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center -mt-3">
          <Link href="/">
            <BrandLogo size={104} />
          </Link>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
          <Link className="transition hover:text-foreground" href="/pricing">
            {t("nav.pricing")}
          </Link>
          <Link className="transition hover:text-foreground" href="/#about">
            {t("nav.about")}
          </Link>
          <Link className="transition hover:text-foreground" href="/login">
            {t("nav.login")}
          </Link>
          <LanguageToggle variant="landing" />
          <ThemeToggle variant="landing" />
        </nav>
      </header>

      <section className="mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
        <h1 className={`${playfair.className} text-3xl font-medium text-foreground sm:text-4xl`}>
          {t("pricing.title")}
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          {t("pricing.subtitle")}
        </p>

        <div className="mt-12 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Free Plan */}
          <div className="flex flex-col rounded-lg border border-border p-6 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {t("pricing.free")}
            </p>
            <p className="mt-3 text-2xl font-medium text-foreground">
              {t("pricing.freePrice")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.freeDesc")}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <li>{t("pricing.freeFeature1")}</li>
              <li>{t("pricing.freeFeature2")}</li>
              <li>{t("pricing.freeFeature3")}</li>
            </ul>
            <Link
              href="/signup"
              className="mt-6 block rounded-lg border border-border bg-background px-4 py-2 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              {t("pricing.getStarted")}
            </Link>
          </div>

          {/* Starter Plan */}
          <div className="flex flex-col rounded-lg border border-border p-6 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {t("pricing.starter")}
            </p>
            <p className="mt-3 text-2xl font-medium text-foreground">
              {t("pricing.starterPrice")}
              <span className="text-sm font-normal text-muted-foreground">{t("pricing.perMonth")}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.starterDesc")}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <li>{t("pricing.starterFeature1")}</li>
              <li>{t("pricing.starterFeature2")}</li>
              <li>{t("pricing.starterFeature3")}</li>
            </ul>
            <button
              onClick={() => handleSubscribeClick("starter")}
              disabled={Boolean(userId && currentPlan === "starter" && subscriptionStatus === "active") || loadingCheckout !== null}
              className={`mt-6 rounded-lg border border-border px-4 py-2 text-sm font-medium transition ${
                userId && currentPlan === "starter" && subscriptionStatus === "active"
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-muted"
              }`}
            >
              {loadingCheckout === "starter" ? "…" : t("pricing.subscribe")}
            </button>
          </div>

          {/* Pro Plan - Highlighted */}
          <div className="relative flex flex-col rounded-lg border-2 border-foreground p-6 text-left">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-white dark:text-black">
              {t("pricing.popular")}
            </span>
            <p className="text-xs font-medium text-muted-foreground">
              {t("pricing.pro")}
            </p>
            <p className="mt-3 text-2xl font-medium text-foreground">
              {t("pricing.proPrice")}
              <span className="text-sm font-normal text-muted-foreground">{t("pricing.perMonth")}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.proDesc")}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <li>{t("pricing.proFeature1")}</li>
              <li>{t("pricing.proFeature2")}</li>
              <li>{t("pricing.proFeature3")}</li>
            </ul>
            <button
              onClick={() => handleSubscribeClick("pro")}
              disabled={Boolean(userId && currentPlan === "pro" && subscriptionStatus === "active") || loadingCheckout !== null}
              className={`mt-6 rounded-lg px-4 py-2 text-sm font-medium transition ${
                userId && currentPlan === "pro" && subscriptionStatus === "active"
                  ? "cursor-not-allowed bg-foreground/50 text-white dark:text-black opacity-50"
                  : "bg-foreground text-white dark:text-black hover:bg-foreground/90"
              }`}
            >
              {loadingCheckout === "pro" ? "…" : t("pricing.subscribe")}
            </button>
          </div>

          {/* Organization Plan */}
          <div className="flex flex-col rounded-lg border border-border p-6 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {t("pricing.organization")}
            </p>
            <p className="mt-3 text-2xl font-medium text-foreground">{t("pricing.custom")}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.orgDesc")}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <li>{t("pricing.orgFeature1")}</li>
              <li>{t("pricing.orgFeature2")}</li>
              <li>{t("pricing.orgFeature3")}</li>
            </ul>
            <a
              href="mailto:contact@soma.app"
              className="mt-6 block rounded-lg border border-border bg-background px-4 py-2 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              {t("pricing.contactUs")}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
            <div className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {APP_NAME}. {t("footer.allRightsReserved")}
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <Link
                href="/confidentialite"
                className="transition hover:text-foreground"
              >
                {t("footer.privacyPolicy")}
              </Link>
              <Link
                href="/cgu-cgv"
                className="transition hover:text-foreground"
              >
                {t("footer.termsOfService")}
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
