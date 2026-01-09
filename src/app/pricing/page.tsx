"use client";

import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { APP_NAME } from "@/lib/brand";

const playfair = Playfair_Display({ subsets: ["latin"] });

export default function PricingPage() {
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
                Pricing
              </Link>
              <Link className="transition hover:text-white" href="/#about">
                About
              </Link>
              <Link className="transition hover:text-white" href="/login">
                Login
              </Link>
            </nav>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
          <h1 className={`${playfair.className} text-4xl text-white/90 sm:text-5xl`}>
            Pricing
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/60">
            Simple, student-friendly plans. Choose clarity and focus, not noise.
          </p>

          <div className="mt-12 grid w-full gap-6 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Free</p>
              <p className="mt-3 text-3xl text-white/90">0</p>
              <p className="mt-2 text-sm text-white/60">Essential study tools.</p>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>Decks and reviews</li>
                <li>Anki import</li>
                <li>Basic analytics</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/10 p-6 text-left text-white/85 shadow-lg shadow-black/20">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Pro</p>
              <p className="mt-3 text-3xl text-white/95">12</p>
              <p className="mt-2 text-sm text-white/70">Advanced workflows and AI.</p>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>AI flashcard generation</li>
                <li>Deep analytics</li>
                <li>Priority support</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-white/70">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Education</p>
              <p className="mt-3 text-3xl text-white/90">Custom</p>
              <p className="mt-2 text-sm text-white/60">Teams and institutions.</p>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>Custom onboarding</li>
                <li>Shared libraries</li>
                <li>Compliance options</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
