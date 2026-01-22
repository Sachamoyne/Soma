"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { ArrowRight, Brain, Layers, Sparkles, Menu, X } from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { LandingAIDemo } from "@/components/LandingAIDemo";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function LandingPage() {
  const { t } = useTranslation();
  const [userPresent, setUserPresent] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active) {
        setUserPresent(Boolean(user));
      }
    };
    fetchUser();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center -mt-3">
          <BrandLogo size={104} />
        </div>
        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
          <Link className="transition hover:text-foreground" href="/pricing">
            {t("nav.pricing")}
          </Link>
          <Link className="transition hover:text-foreground" href="#about">
            {t("nav.about")}
          </Link>
          <Link className="transition hover:text-foreground" href="/login">
            {t("nav.login")}
          </Link>
          <LanguageToggle variant="landing" />
          <ThemeToggle variant="landing" />
        </nav>

        {/* Mobile nav toggle */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted sm:hidden"
          aria-label="Toggle navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        {/* Mobile menu panel */}
        {mobileNavOpen && (
          <div className="absolute left-4 right-4 top-20 z-20 rounded-lg border border-border bg-background px-4 py-4 shadow-sm sm:hidden">
            <nav className="flex flex-col gap-1 text-sm text-foreground">
              <Link
                className="rounded-md px-3 py-2 hover:bg-muted"
                href="/pricing"
                onClick={() => setMobileNavOpen(false)}
              >
                {t("nav.pricing")}
              </Link>
              <Link
                className="rounded-md px-3 py-2 hover:bg-muted"
                href="#about"
                onClick={() => setMobileNavOpen(false)}
              >
                {t("nav.about")}
              </Link>
              <Link
                className="rounded-md px-3 py-2 hover:bg-muted"
                href="/login"
                onClick={() => setMobileNavOpen(false)}
              >
                {t("nav.login")}
              </Link>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
                <LanguageToggle variant="landing" />
                <ThemeToggle variant="landing" />
              </div>
            </nav>
          </div>
        )}
      </header>

      <section className="flex min-h-[80vh] items-center justify-center px-6 pb-20 pt-10 sm:px-10">
        <div className="flex w-full max-w-3xl flex-col items-center justify-center text-center">
          <div className="mb-6 inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {t("landing.taglineBadge")}
          </div>
          <h1
            className={`${playfair.className} text-4xl font-medium leading-tight text-foreground sm:text-5xl lg:text-6xl`}
          >
            {t("landing.headline").split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            {APP_TAGLINE}. {t("landing.subheadline")}
          </p>

          {!userPresent && (
            <div className="mt-10 flex items-center justify-center">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-white transition hover:bg-foreground/90"
              >
                {t("landing.getStarted")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}

          {/* AI Demo Animation */}
          <LandingAIDemo />
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 px-6 py-10 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            {t("landing.aiPowered")}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {t("landing.scienceBacked")}
          </div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {t("landing.ankiCompatible")}
          </div>
        </div>
      </section>

      <section id="about" className="border-t border-border">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 text-left sm:grid-cols-[1fr_1.2fr]">
          <h2 className={`${playfair.className} text-2xl font-medium text-foreground`}>
            {t("landing.aboutTitle")}
          </h2>
          <div className="space-y-4 text-muted-foreground">
            <p>{t("landing.aboutP1")}</p>
            <p>{t("landing.aboutP2")}</p>
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
