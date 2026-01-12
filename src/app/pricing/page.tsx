"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import { WAITLIST_ONLY } from "@/lib/features";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function PricingPage() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    if (WAITLIST_ONLY) {
      router.replace("/");
    }
  }, [router]);

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

        <section className="relative z-10 mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
          <h1 className={`${playfair.className} text-4xl text-white/90 sm:text-5xl`}>
            {t("pricing.title")}
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/60">
            {t("pricing.subtitle")}
          </p>

          <div className="mt-12 grid w-full gap-6 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t("pricing.free")}</p>
              <p className="mt-3 text-3xl text-white/90">{t("pricing.freePrice")}</p>
              <p className="mt-2 text-sm text-white/60">{t("pricing.freeDesc")}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>{t("pricing.freeFeature1")}</li>
                <li>{t("pricing.freeFeature2")}</li>
                <li>{t("pricing.freeFeature3")}</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/10 p-6 text-left text-white/85 shadow-lg shadow-black/20">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t("pricing.pro")}</p>
              <p className="mt-3 text-3xl text-white/95">{t("pricing.proPrice")}</p>
              <p className="mt-2 text-sm text-white/70">{t("pricing.proDesc")}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>{t("pricing.proFeature1")}</li>
                <li>{t("pricing.proFeature2")}</li>
                <li>{t("pricing.proFeature3")}</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t("pricing.education")}</p>
              <p className="mt-3 text-3xl text-white/90">{t("pricing.custom")}</p>
              <p className="mt-2 text-sm text-white/60">{t("pricing.eduDesc")}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>{t("pricing.eduFeature1")}</li>
                <li>{t("pricing.eduFeature2")}</li>
                <li>{t("pricing.eduFeature3")}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
