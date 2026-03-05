"use client";

import { useEffect, useState } from "react";

type Step = "generating" | "question" | "answer" | "next-card";

const STEP_DURATION: Record<Step, number> = {
  generating: 1400,
  question: 2200,
  answer: 1800,
  "next-card": 2000,
};

const NEXT_STEP: Record<Step, Step> = {
  generating: "question",
  question: "answer",
  answer: "next-card",
  "next-card": "generating",
};

const FADE_MS = 240;

function StatusBar() {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] font-semibold text-foreground/75">9:41</span>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <div className="flex items-end gap-[2px]">
          {[2, 3, 4, 5].map((h) => (
            <div
              key={h}
              className="w-[2px] rounded-[1px] bg-foreground/70"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="relative h-[9px] w-[15px] rounded-[2px] border border-foreground/60">
          <div className="absolute inset-[1.5px] right-[2px] rounded-[1px] bg-foreground/70" />
          <div className="absolute -right-[3px] top-[2px] h-[4px] w-[2px] rounded-r-[1px] bg-foreground/45" />
        </div>
      </div>
    </div>
  );
}

function Header({ count }: { count: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-foreground">History</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">{count}</span>
    </div>
  );
}

function RatingButtons() {
  const buttons = [
    { label: "Again", bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-600 dark:text-red-400" },
    { label: "Hard", bg: "bg-orange-100 dark:bg-orange-950/50", text: "text-orange-600 dark:text-orange-400" },
    { label: "Good", bg: "bg-green-100 dark:bg-green-950/50", text: "text-green-600 dark:text-green-400" },
    { label: "Easy", bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-600 dark:text-blue-400" },
  ];

  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
      {buttons.map(({ label, bg, text }) => (
        <div key={label} className="w-full rounded-lg py-2 text-center">
          <span className={`block rounded-lg py-1 text-[9px] font-semibold ${bg} ${text}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({ question, answerVisible }: { question: string; answerVisible?: boolean }) {
  return (
    <div className="min-h-0 flex-1 flex items-center">
      <div className="w-full [perspective:900px]">
        <div
          className="relative h-[178px] w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: answerVisible ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          <div className="absolute inset-0 rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm [backface-visibility:hidden]">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              QUESTION
            </p>
            <p className="text-[12px] font-medium leading-snug text-foreground">{question}</p>
            <p className="mt-4 text-[9px] text-muted-foreground/55">Tap to reveal</p>
          </div>
          <div className="absolute inset-0 rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              ANSWER
            </p>
            <p className="text-2xl font-bold text-foreground">1789</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneratingScreen() {
  return (
    <div className="flex h-full flex-col">
      <Header count="0 / 5" />
      <div className="min-h-0 flex-1 rounded-2xl border border-border bg-card/70 px-4 py-5">
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-[11px] font-medium text-foreground">Generating flashcards...</p>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/35"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        </div>
      </div>
      <RatingButtons />
    </div>
  );
}

function QuestionScreen() {
  return (
    <div className="flex h-full flex-col">
      <Header count="1 / 5" />
      <QuestionCard question="What year did the French Revolution begin?" />
      <RatingButtons />
    </div>
  );
}

function AnswerScreen() {
  return (
    <div className="flex h-full flex-col">
      <Header count="1 / 5" />
      <QuestionCard question="What year did the French Revolution begin?" answerVisible />
      <RatingButtons />
    </div>
  );
}

function NextCardScreen() {
  return (
    <div className="flex h-full flex-col">
      <Header count="2 / 5" />
      <QuestionCard question="What major historical event began in 1789 in France?" />
      <RatingButtons />
    </div>
  );
}

export function SomaDemo() {
  const [step, setStep] = useState<Step>("generating");
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const duration = STEP_DURATION[step];
    const fadeOut = setTimeout(() => setOpacity(0), duration);
    const next = setTimeout(() => {
      setStep((current) => NEXT_STEP[current]);
      setOpacity(1);
    }, duration + FADE_MS);

    return () => {
      clearTimeout(fadeOut);
      clearTimeout(next);
    };
  }, [step]);

  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="min-h-0 flex-1" style={{ opacity, transition: `opacity ${FADE_MS}ms ease` }}>
        {step === "generating" && <GeneratingScreen />}
        {step === "question" && <QuestionScreen />}
        {step === "answer" && <AnswerScreen />}
        {step === "next-card" && <NextCardScreen />}
      </div>
    </div>
  );
}
