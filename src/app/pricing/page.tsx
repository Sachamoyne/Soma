"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import { WAITLIST_ONLY } from "@/lib/features";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

const playfair = Playfair_Display({ subsets: ["latin"] });

type PlanId = "starter" | "pro";

export default function PricingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (WAITLIST_ONLY) {
      router.replace("/");
    }
  }, [router]);

  const handleSubscribe = async (plan: PlanId) => {
    setLoadingPlan(plan);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login?redirect=/pricing");
          return;
        }
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingPlan(null);
    }
  };

  if (WAITLIST_ONLY) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/60 to-slate-950/90" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-md">
            <Link
              className="text-xs font-semibold tracking-[0.35em] text-white/85"
              href="/"
            >
              {APP_NAME}
            </Link>
            <nav className="hidden items-center gap-8 text-xs font-light tracking-[0.2em] text-white/75 sm:flex">
              <Link className="transition hover:text-white" href="/pricing">
                {t("nav.pricing")}
              </Link>
              <Link className="transition hover:text-white" href="/#about">
                {t("nav.about")}
              </Link>
              <Link className="transition hover:text-white" href="/login">
                {t("nav.login")}
              </Link>
              <LanguageToggle variant="landing" />
            </nav>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
          <h1 className={`${playfair.className} text-4xl text-white/90 sm:text-5xl`}>
            {t("pricing.title")}
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/60">
            {t("pricing.subtitle")}
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mt-12 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Free Plan */}
            <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                {t("pricing.free")}
              </p>
              <p className="mt-3 text-3xl text-white/90">
                {t("pricing.freePrice")}
              </p>
              <p className="mt-2 text-sm text-white/60">
                {t("pricing.freeDesc")}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/60">
                <li>{t("pricing.freeFeature1")}</li>
                <li>{t("pricing.freeFeature2")}</li>
                <li>{t("pricing.freeFeature3")}</li>
              </ul>
              <Link
                href="/login"
                className="mt-6 block rounded-full border border-white/20 bg-transparent px-4 py-2 text-center text-sm text-white/70 transition hover:bg-white/5"
              >
                {t("pricing.getStarted")}
              </Link>
            </div>

            {/* Starter Plan */}
            <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                {t("pricing.starter")}
              </p>
              <p className="mt-3 text-3xl text-white/90">
                {t("pricing.starterPrice")}
                <span className="text-lg text-white/50">{t("pricing.perMonth")}</span>
              </p>
              <p className="mt-2 text-sm text-white/60">
                {t("pricing.starterDesc")}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/60">
                <li>{t("pricing.starterFeature1")}</li>
                <li>{t("pricing.starterFeature2")}</li>
                <li>{t("pricing.starterFeature3")}</li>
              </ul>
              <button
                onClick={() => handleSubscribe("starter")}
                disabled={loadingPlan !== null}
                className="mt-6 rounded-full border border-white/20 bg-transparent px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 disabled:opacity-50"
              >
                {loadingPlan === "starter" ? "..." : t("pricing.subscribe")}
              </button>
            </div>

            {/* Pro Plan - Highlighted */}
            <div className="relative flex flex-col rounded-3xl border border-white/20 bg-white/10 p-6 text-left text-white/85 shadow-lg shadow-black/20">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-900">
                {t("pricing.popular")}
              </span>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                {t("pricing.pro")}
              </p>
              <p className="mt-3 text-3xl text-white/95">
                {t("pricing.proPrice")}
                <span className="text-lg text-white/50">{t("pricing.perMonth")}</span>
              </p>
              <p className="mt-2 text-sm text-white/70">
                {t("pricing.proDesc")}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/70">
                <li>{t("pricing.proFeature1")}</li>
                <li>{t("pricing.proFeature2")}</li>
                <li>{t("pricing.proFeature3")}</li>
              </ul>
              <button
                onClick={() => handleSubscribe("pro")}
                disabled={loadingPlan !== null}
                className="mt-6 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:opacity-50"
              >
                {loadingPlan === "pro" ? "..." : t("pricing.subscribe")}
              </button>
            </div>

            {/* Organization Plan */}
            <div className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                {t("pricing.organization")}
              </p>
              <p className="mt-3 text-3xl text-white/90">{t("pricing.custom")}</p>
              <p className="mt-2 text-sm text-white/60">
                {t("pricing.orgDesc")}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/60">
                <li>{t("pricing.orgFeature1")}</li>
                <li>{t("pricing.orgFeature2")}</li>
                <li>{t("pricing.orgFeature3")}</li>
              </ul>
              <a
                href="mailto:contact@soma.app"
                className="mt-6 block rounded-full border border-white/20 bg-transparent px-4 py-2 text-center text-sm text-white/70 transition hover:bg-white/5"
              >
                {t("pricing.contactUs")}
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
