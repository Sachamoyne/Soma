"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { CookieConsent } from "@/components/CookieConsent";
import { isNativeIOS } from "@/lib/native";

const playfair = Playfair_Display({ subsets: ["latin"] });
const SEO_PARAGRAPH_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;
const FAQ_KEYS = [
  "bestSpacedRepetitionApp",
  "betterThanAnki",
  "aiFlashcards",
  "ankiImport",
  "freePlan",
  "spacedRepetitionHowItWorks",
] as const;

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  if (typeof document === "undefined") return;

  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.text = JSON.stringify(data);
}

export default function LandingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const nativeIOS = isNativeIOS();
  const [userPresent, setUserPresent] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const seoParagraphs = useMemo(
    () => SEO_PARAGRAPH_KEYS.map((key) => t(`landingSeo.${key}`)),
    [t],
  );
  const faqItems = useMemo(
    () =>
      FAQ_KEYS.map((key) => ({
        question: t(`landingSeo.faq.${key}.q`),
        answer: t(`landingSeo.faq.${key}.a`),
      })),
    [t],
  );
  const productDescription = t("landingSeo.productDescription");

  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Authenticated user → go straight to /decks (no landing page)
        router.replace("/decks");
        return;
      }
      if (nativeIOS) {
        router.replace("/login");
        return;
      }
      if (active) {
        setUserPresent(false);
      }
    };
    fetchUser();
    return () => {
      active = false;
    };
  }, [nativeIOS, router]);

  useEffect(() => {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    };

    const productSchema = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: APP_NAME,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, iOS",
      description: productDescription,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
      },
    };

    upsertJsonLd("soma-faq-schema", faqSchema);
    upsertJsonLd("soma-product-schema", productSchema);

    return () => {
      document.getElementById("soma-faq-schema")?.remove();
      document.getElementById("soma-product-schema")?.remove();
    };
  }, [faqItems, productDescription]);

  if (nativeIOS) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CookieConsent />
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

          <div className="mt-10 flex items-center justify-center">
            <Link
              href={userPresent ? "/decks" : "/login"}
              className="group inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-foreground/90"
            >
              {t("landing.getStarted")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

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

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className={`${playfair.className} text-2xl font-medium text-foreground sm:text-3xl`}>
            {t("landingSeo.title")}
          </h2>
          <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {seoParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h3 className={`${playfair.className} text-2xl font-medium text-foreground sm:text-3xl`}>
            {t("landingSeo.faqTitle")}
          </h3>
          <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card/30">
            {faqItems.map((item) => (
              <details key={item.question} className="group px-5 py-4">
                <summary className="cursor-pointer list-none pr-6 text-sm font-medium text-foreground sm:text-base">
                  {item.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {item.answer}
                </p>
              </details>
            ))}
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
