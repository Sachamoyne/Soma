"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { Brain, Layers, Sparkles } from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { isNativeIOS } from "@/lib/native";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function WelcomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const nativeIOS = isNativeIOS();

  useEffect(() => {
    if (!nativeIOS) return;
    router.replace("/decks");
  }, [nativeIOS, router]);

  if (nativeIOS) {
    return <div className="min-h-screen bg-background" />;
  }

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
            <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.35em] text-white/85">
              <BrandLogo size={28} />
              <span>{APP_NAME}</span>
            </div>
            <nav className="hidden items-center gap-8 text-xs font-light tracking-[0.2em] text-white/75 sm:flex">
              <Link className="transition hover:text-white" href="/pricing">
                {t("nav.pricing")}
              </Link>
              <Link className="transition hover:text-white" href="#about">
                {t("nav.about")}
              </Link>
              <Link className="transition hover:text-white" href="/login">
                {t("nav.login")}
              </Link>
              <LanguageToggle variant="landing" />
            </nav>
          </div>
        </header>

        <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pb-16 pt-10 sm:px-10">
          <div className="flex w-full max-w-3xl flex-col items-center justify-center text-center">
            <div className="mx-auto mt-10 w-full max-w-2xl">
              <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-8 text-center shadow-xl shadow-white/10 backdrop-blur">
                <p className={`${playfair.className} text-3xl text-white/95`}>
                  Félicitations !
                </p>
                <p className="mt-4 text-base text-white/70 sm:text-lg">
                  Votre compte a été créé avec succès.
                </p>
                <p className="mt-4 text-sm text-white/60">
                  Vous pouvez maintenant commencer à utiliser Soma.
                </p>
              </div>
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
