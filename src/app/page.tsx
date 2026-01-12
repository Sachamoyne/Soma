"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { WAITLIST_ONLY } from "@/lib/features";
import { ArrowRight, Brain, Layers, Sparkles } from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function LandingPage() {
  const { t } = useTranslation();
  const [userPresent, setUserPresent] = useState(false);
  const [betaEmail, setBetaEmail] = useState("");
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaSuccess, setBetaSuccess] = useState(false);
  const [betaError, setBetaError] = useState<string | null>(null);

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

  const handleBetaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (betaLoading) return;

    const trimmed = betaEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setBetaError(t("landing.invalidEmail"));
      setBetaSuccess(false);
      return;
    }

    setBetaLoading(true);
    setBetaError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("beta_waitlist")
        .insert({ email: trimmed });

      if (error) {
        console.error("beta_waitlist insert error", error);
        if ((error as { code?: string }).code === "23505") {
          setBetaError(t("landing.alreadyOnList"));
        } else {
          setBetaError(t("landing.genericError"));
        }
        setBetaSuccess(false);
      } else {
        setBetaSuccess(true);
        setBetaEmail("");
      }
    } finally {
      setBetaLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23030812'/><stop offset='100%' stop-color='%230a1224'/></linearGradient><radialGradient id='vignette' cx='50%' cy='50%' r='70%'><stop offset='0%' stop-color='%23030812' stop-opacity='0'/><stop offset='70%' stop-color='%23030812' stop-opacity='0.3'/><stop offset='100%' stop-color='%23030812' stop-opacity='0.6'/></radialGradient><radialGradient id='somaCore' cx='48%' cy='52%' r='30%'><stop offset='0%' stop-color='%23f8fafc' stop-opacity='0.95'/><stop offset='45%' stop-color='%23c7d2fe' stop-opacity='0.75'/><stop offset='100%' stop-color='%2393c5fd' stop-opacity='0.2'/></radialGradient><radialGradient id='somaGlow' cx='48%' cy='52%' r='55%'><stop offset='0%' stop-color='%23438bff' stop-opacity='0.45'/><stop offset='70%' stop-color='%230a1224' stop-opacity='0.08'/><stop offset='100%' stop-color='%230a1224' stop-opacity='0'/></radialGradient><filter id='blurSoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='12'/></filter><filter id='blurDeep' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='22'/></filter><filter id='glow' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='16' result='b'/><feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge></filter></defs><rect width='1600' height='1000' fill='url(%23bg)'/><rect width='1600' height='1000' fill='url(%23somaGlow)'/><g filter='url(%23blurDeep)' stroke='%2383b2ff' stroke-opacity='0.35' stroke-width='2.4' fill='none'><path d='M700 520 C560 420, 420 340, 240 300'/><path d='M760 520 C840 360, 840 220, 780 120'/><path d='M840 520 C980 420, 1160 380, 1360 340'/><path d='M760 600 C840 720, 980 820, 1180 900'/></g><g stroke='%2393c5fd' stroke-opacity='0.8' stroke-width='2.6' fill='none'><path d='M730 520 C620 420, 520 340, 380 300'/><path d='M780 500 C720 380, 720 260, 780 160'/><path d='M830 520 C960 440, 1080 400, 1220 360'/><path d='M780 560 C860 680, 980 760, 1120 820'/><path d='M720 560 C580 660, 440 740, 300 820'/></g><g stroke='%23e0f2fe' stroke-opacity='0.6' stroke-width='1.6' fill='none'><path d='M740 520 C580 470, 430 430, 260 420'/><path d='M790 500 C870 420, 980 320, 1140 260'/><path d='M770 560 C840 640, 900 720, 1000 820'/></g><path d='M850 520 C1010 520, 1160 520, 1320 500 C1420 490, 1500 520, 1580 560' stroke='%236ee7ff' stroke-opacity='0.8' stroke-width='3' fill='none'/><g fill='%23f8fafc' fill-opacity='0.9'><circle cx='760' cy='520' r='84' fill='url(%23somaCore)' filter='url(%23glow)'><animate attributeName='opacity' values='0.75;0.95;0.75' dur='7s' repeatCount='indefinite'/></circle><circle cx='380' cy='300' r='12'/><circle cx='780' cy='160' r='11'/><circle cx='1220' cy='360' r='12'/><circle cx='1120' cy='820' r='11'/><circle cx='300' cy='820' r='11'/><circle cx='260' cy='420' r='9'/><circle cx='1140' cy='260' r='10'/><circle cx='1000' cy='820' r='9'/><circle cx='1320' cy='500' r='9'/><circle cx='1400' cy='520' r='8'/><circle cx='1480' cy='540' r='8'/><circle cx='1560' cy='560' r='8'/></g><rect width='1600' height='1000' fill='url(%23vignette)'/></svg>\")",
          }}
        />
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[3px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/40 to-slate-950/90" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-md">
            <div className="text-xs font-semibold tracking-[0.35em] text-white/85">
              {APP_NAME}
            </div>
            <nav className="hidden items-center gap-8 text-xs font-light tracking-[0.2em] text-white/75 sm:flex">
              {!WAITLIST_ONLY && (
                <Link className="transition hover:text-white" href="/pricing">
                  {t("nav.pricing")}
                </Link>
              )}
              <Link className="transition hover:text-white" href="#about">
                {t("nav.about")}
              </Link>
              {!WAITLIST_ONLY && (
                <Link className="transition hover:text-white" href="/login">
                  {t("nav.login")}
                </Link>
              )}
              <LanguageToggle variant="landing" />
            </nav>
          </div>
        </header>

        <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pb-16 pt-10 sm:px-10">
          <div className="flex w-full max-w-3xl flex-col items-center justify-center text-center">
            <div className="mb-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              {t("landing.taglineBadge")}
            </div>
            <h1
              className={`${playfair.className} text-4xl font-semibold leading-tight text-white/95 sm:text-6xl lg:text-7xl`}
            >
              {t("landing.headline").split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-white/70 sm:text-lg">
              {APP_TAGLINE}. {t("landing.subheadline")}
            </p>

            {!userPresent && !WAITLIST_ONLY && (
              <div className="mt-10 flex items-center justify-center">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-white/20 transition hover:shadow-xl hover:shadow-white/30"
                >
                  {t("landing.loginButton")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            )}

            <div className="mx-auto mt-10 w-full max-w-2xl">
              <div
                className={`rounded-3xl border border-white/20 bg-white/10 p-4 shadow-xl shadow-white/10 backdrop-blur transition-all duration-200 ${
                  betaSuccess
                    ? "pointer-events-none opacity-0 translate-y-2"
                    : "opacity-100 translate-y-0"
                } motion-reduce:transition-none`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="email"
                    className="h-12 w-full flex-1 rounded-full border border-white/15 bg-white/10 px-5 text-sm text-white/80 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                    placeholder={t("landing.emailPlaceholder")}
                    value={betaEmail}
                    onChange={(event) => {
                      setBetaEmail(event.target.value);
                      if (betaError) setBetaError(null);
                      if (betaSuccess) setBetaSuccess(false);
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBetaSubmit}
                    disabled={betaLoading}
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-slate-900 shadow-lg shadow-white/20 transition hover:shadow-xl hover:shadow-white/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {betaLoading ? t("landing.joining") : t("landing.joinBeta")}
                  </button>
                </div>
                <div className="mt-3 flex flex-col items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/60">
                  <span>{t("landing.privateBeta")}</span>
                  {betaError ? (
                    <span className="text-sm normal-case text-amber-200">
                      {betaError}
                    </span>
                  ) : null}
                </div>
              </div>

              {betaSuccess && (
                <div className="mt-4 rounded-3xl border border-white/15 bg-white/10 px-6 py-5 text-center shadow-xl shadow-white/10 backdrop-blur transition-all duration-200 motion-reduce:transition-none">
                  <p className={`${playfair.className} text-2xl text-white/90`}>
                    {t("landing.betaSuccess")}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {t("landing.betaSuccessSubtext")}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.35em] text-white/40">
                    {t("landing.betaNoSpam")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950/70">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 px-6 py-10 text-xs uppercase tracking-[0.35em] text-white/60">
            <div className="flex items-center gap-3">
              <Brain className="h-4 w-4 stroke-[1.2]" />
              {t("landing.aiPowered")}
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 stroke-[1.2]" />
              {t("landing.scienceBacked")}
            </div>
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 stroke-[1.2]" />
              {t("landing.ankiCompatible")}
            </div>
          </div>
        </section>

        {!WAITLIST_ONLY && (
          <section className="relative z-10 border-t border-white/10 bg-slate-950/80">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16 text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                {t("landing.usedBy")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-semibold tracking-[0.2em] text-white/40">
                <span>HEC</span>
                <span>ENS</span>
                <span>Polytechnique</span>
                <span>Sorbonne</span>
                <span>EPFL</span>
              </div>
            </div>
          </section>
        )}

        <section id="about" className="relative z-10 border-t border-white/10 bg-slate-950/85">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 text-left sm:grid-cols-[1fr_1.2fr]">
            <h2 className={`${playfair.className} text-3xl text-white/90`}>
              {t("landing.aboutTitle")}
            </h2>
            <div className="space-y-4 text-white/70">
              <p>{t("landing.aboutP1")}</p>
              <p>{t("landing.aboutP2")}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
