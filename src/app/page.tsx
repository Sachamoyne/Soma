"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { ArrowRight, Brain, Layers, Sparkles, Wand2 } from "lucide-react";
import { Playfair_Display } from "next/font/google";

const playfair = Playfair_Display({ subsets: ["latin"] });

const defaultPrompt = "Victor Hugo est mort en 1885";

const stripPunctuation = (value: string) =>
  value.replace(/[.!?]$/, "").trim();

const buildFlashcard = (prompt: string) => {
  const cleaned = prompt.trim();
  if (cleaned.length < 8) {
    return {
      front: "En quelle annee est mort Victor Hugo ?",
      back: "1885",
    };
  }

  const sentence = stripPunctuation(cleaned.split(".")[0] || cleaned);

  const deathMatch = sentence.match(/^(.+?) est mort en (\d{3,4})/i);
  if (deathMatch) {
    return {
      front: `En quelle annee est mort ${deathMatch[1].trim()} ?`,
      back: deathMatch[2],
    };
  }

  const capitalMatch = sentence.match(/^La capitale de (.+?) est (.+)$/i);
  if (capitalMatch) {
    return {
      front: `Quelle est la capitale de ${capitalMatch[1].trim()} ?`,
      back: stripPunctuation(capitalMatch[2]),
    };
  }

  const equationMatch = sentence.match(/^(.+?)\s*=\s*(.+)$/);
  if (equationMatch) {
    return {
      front: `Combien font ${equationMatch[1].trim()} ?`,
      back: stripPunctuation(equationMatch[2]),
    };
  }

  const motiveMatch = sentence.match(/^(.+?) a (.+?) pour (.+)$/i);
  if (motiveMatch) {
    return {
      front: `Pourquoi ${motiveMatch[1].trim()} a-t-il ${motiveMatch[2].trim()} ?`,
      back: `Pour ${stripPunctuation(motiveMatch[3])}`,
    };
  }

  const becauseMatch = sentence.match(/^(.+?) parce que (.+)$/i);
  if (becauseMatch) {
    return {
      front: `Pourquoi ${becauseMatch[1].trim()} ?`,
      back: `Parce que ${stripPunctuation(becauseMatch[2])}`,
    };
  }

  const eventMatch = sentence.match(/^(.+?) a eu lieu en (\d{3,4})/i);
  if (eventMatch) {
    return {
      front: `En quelle annee a eu lieu ${eventMatch[1].trim()} ?`,
      back: eventMatch[2],
    };
  }

  const principleMatch = sentence.match(/^Le principe d'?(.+?) est (.+)$/i);
  if (principleMatch) {
    return {
      front: `Quel est le principe d'${principleMatch[1].trim()} ?`,
      back: stripPunctuation(principleMatch[2]),
    };
  }

  const genericMatch = sentence.match(/^(.+?) est (.+)$/i);
  if (genericMatch) {
    return {
      front: `Qu'est-ce que ${genericMatch[1].trim()} ?`,
      back: stripPunctuation(genericMatch[2]),
    };
  }

  const pluralMatch = sentence.match(/^(.+?) sont (.+)$/i);
  if (pluralMatch) {
    return {
      front: `Que sont ${pluralMatch[1].trim()} ?`,
      back: stripPunctuation(pluralMatch[2]),
    };
  }

  return {
    front: "De quoi parle cette phrase ?",
    back: sentence,
  };
};

const generateSmartFlashcard = async (prompt: string) => {
  const apiUrl = process.env.NEXT_PUBLIC_FLASHCARD_API_URL;
  if (apiUrl) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt:
          "Transforme cette phrase en une flashcard Anki. Renvoie uniquement un objet JSON avec 'front' et 'back'.",
        input: prompt,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.front && data?.back) {
        return { front: String(data.front), back: String(data.back) };
      }
    }
  }

  return buildFlashcard(prompt);
};

export default function LandingPage() {
  const [userPresent, setUserPresent] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputPlaceholder, setInputPlaceholder] = useState(
    "Que souhaitez-vous memoriser aujourd'hui ?"
  );
  const [flashcard, setFlashcard] = useState(() => buildFlashcard(defaultPrompt));
  const [typedFront, setTypedFront] = useState(flashcard.front);
  const [typedBack, setTypedBack] = useState(flashcard.back);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

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

  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    setTypedFront("");
    setTypedBack("");

    let frontIndex = 0;
    let backIndex = 0;
    const frontText = flashcard.front;
    const backText = flashcard.back;

    const timer = window.setInterval(() => {
      if (frontIndex < frontText.length) {
        frontIndex += 1;
        setTypedFront(frontText.slice(0, frontIndex));
        return;
      }
      if (backIndex < backText.length) {
        backIndex += 1;
        setTypedBack(backText.slice(0, backIndex));
        return;
      }
      window.clearInterval(timer);
      setIsAnimating(false);
    }, 18);

    return () => window.clearInterval(timer);
  }, [flashcard, isAnimating]);

  const handleGenerate = () => {
    if (isProcessing || isAnimating) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setInputPlaceholder("Veuillez saisir une information a memoriser...");
      return;
    }
    setInputPlaceholder("Que souhaitez-vous memoriser aujourd'hui ?");
    setTypedFront("IA en cours de reflexion...");
    setTypedBack("IA en cours de reflexion...");
    setIsProcessing(true);
    window.setTimeout(async () => {
      const nextCard = await generateSmartFlashcard(trimmed);
      setFlashcard(nextCard);
      setInputValue("");
      setIsProcessing(false);
      setIsAnimating(true);
    }, 1200);
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
              <Link className="transition hover:text-white" href="/pricing">
                Pricing
              </Link>
              <Link className="transition hover:text-white" href="#about">
                About
              </Link>
              <Link className="transition hover:text-white" href="/login">
                Login
              </Link>
            </nav>
          </div>
        </header>

        <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pb-16 pt-10 sm:px-10">
          <div className="flex w-full max-w-3xl flex-col items-center justify-center text-center">
            <div className="mb-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              Clarte mentale augmentee
            </div>
            <h1
              className={`${playfair.className} text-4xl font-semibold leading-tight text-white/95 sm:text-6xl lg:text-7xl`}
            >
              Master anything,
              <br />
              remember everything.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-white/70 sm:text-lg">
              {APP_TAGLINE}. Une experience premium pour memoriser plus vite, avec elegance et precision.
            </p>

            {!userPresent && (
              <div className="mt-10 flex items-center justify-center">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-white/20 transition hover:shadow-xl hover:shadow-white/30"
                >
                  Login
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            )}

            <div className="mx-auto mt-10 w-full max-w-2xl rounded-3xl border border-white/20 bg-white/10 p-4 shadow-xl shadow-white/10 backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="h-12 w-full flex-1 rounded-full border border-white/10 bg-white/10 px-5 text-sm text-white/80 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder={inputPlaceholder}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isProcessing || isAnimating}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-semibold uppercase tracking-[0.25em] text-slate-900 shadow-lg shadow-white/20 transition hover:shadow-xl hover:shadow-white/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isProcessing || isAnimating ? "Generation..." : "Generer Flashcard"}
                  <Wand2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative mx-auto mt-10 max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
              {(isProcessing || isAnimating) && (
                <div className="absolute right-5 top-5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                  AI Generating...
                </div>
              )}
              <div className="text-xs uppercase tracking-[0.3em] text-white/50">Preview</div>
              <div className="mt-5 space-y-4 text-left">
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm text-white/85">
                  <p className={isProcessing || isAnimating ? "animate-shimmer" : ""}>
                    {typedFront}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm text-white/70">
                  <p className={isProcessing || isAnimating ? "animate-shimmer" : ""}>
                    {typedBack}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950/70">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 px-6 py-10 text-xs uppercase tracking-[0.35em] text-white/60">
            <div className="flex items-center gap-3">
              <Brain className="h-4 w-4 stroke-[1.2]" />
              AI-powered
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 stroke-[1.2]" />
              Science-backed
            </div>
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 stroke-[1.2]" />
              Anki compatible
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-white/10 bg-slate-950/80">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">
              Used by students from top institutions
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
              About Synapse
            </h2>
            <div className="space-y-4 text-white/70">
              <p>
                Synapse is built to help you learn better, not more. We focus on
                clarity, cognitive science, and spaced repetition to make every
                review session count.
              </p>
              <p>
                The product is designed as a quiet companion for serious
                learners. Every surface stays minimal so your attention stays on
                what matters.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
