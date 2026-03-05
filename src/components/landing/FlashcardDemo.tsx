"use client";

import { useEffect, useState } from "react";

const DEMO_CARDS = [
  {
    front: "What year did the French Revolution begin?",
    back: "1789",
    deck: "History",
    index: 3,
    total: 24,
  },
  {
    front: "Define opportunity cost.",
    back: "The value of the next best alternative forgone.",
    deck: "Economics",
    index: 7,
    total: 18,
  },
  {
    front: "What process converts sunlight into chemical energy in plants?",
    back: "Photosynthesis",
    deck: "Biology",
    index: 12,
    total: 31,
  },
];

export function FlashcardDemo() {
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [visible, setVisible] = useState(true);

  const card = DEMO_CARDS[cardIndex];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Show question for 3s, then fade out for flip
    timers.push(setTimeout(() => setVisible(false), 3000));
    // After 400ms fade, flip to answer
    timers.push(
      setTimeout(() => {
        setIsFlipped(true);
        setVisible(true);
      }, 3400)
    );
    // Show answer for 3s, then fade out
    timers.push(setTimeout(() => setVisible(false), 6400));
    // After 400ms fade, advance to next card
    timers.push(
      setTimeout(() => {
        setCardIndex((i) => (i + 1) % DEMO_CARDS.length);
        setIsFlipped(false);
        setVisible(true);
      }, 6800)
    );

    return () => timers.forEach(clearTimeout);
  }, [cardIndex]);

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-foreground/70">9:41</span>
        <div className="flex items-center gap-1.5">
          {/* Signal */}
          <div className="flex items-end gap-[2px]">
            {[2, 3, 4, 5].map((h) => (
              <div
                key={h}
                className="w-[2px] rounded-[1px] bg-foreground/70"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          {/* Battery */}
          <div className="relative flex h-[9px] w-[15px] items-center rounded-[2px] border border-foreground/60">
            <div className="absolute inset-[1.5px] right-[2px] rounded-[1px] bg-foreground/70" />
            <div className="absolute -right-[3px] top-[2px] h-[4px] w-[2px] rounded-r-[1px] bg-foreground/40" />
          </div>
        </div>
      </div>

      {/* Deck header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">{card.deck}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
          {card.index} / {card.total}
        </span>
      </div>

      {/* Card area — flex-1 so it fills available vertical space */}
      <div
        className="min-h-0 flex-1 flex items-center justify-center"
        style={{ transition: "opacity 0.35s ease", opacity: visible ? 1 : 0 }}
      >
        <div className="w-full rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm">
          {!isFlipped ? (
            <>
              <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Question
              </p>
              <p className="text-[12px] font-medium leading-snug text-foreground">
                {card.front}
              </p>
              <p className="mt-4 text-[9px] text-muted-foreground/50">
                Tap to reveal
              </p>
            </>
          ) : (
            <>
              <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Answer
              </p>
              <p className="text-xl font-bold text-foreground">{card.back}</p>
              <p className="mt-3 text-[9px] text-muted-foreground/50">
                How well did you remember?
              </p>
            </>
          )}
        </div>
      </div>

      {/* Rating buttons — decorative only */}
      <div
        className="mt-3 grid grid-cols-4 gap-1.5"
        style={{
          transition: "opacity 0.35s ease",
          opacity: isFlipped && visible ? 1 : 0,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        {[
          { label: "Again", interval: "1m", bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-600 dark:text-red-400" },
          { label: "Hard",  interval: "1j", bg: "bg-orange-100 dark:bg-orange-950/50", text: "text-orange-600 dark:text-orange-400" },
          { label: "Good",  interval: "3j", bg: "bg-green-100 dark:bg-green-950/50",  text: "text-green-600 dark:text-green-400" },
          { label: "Easy",  interval: "7j", bg: "bg-blue-100 dark:bg-blue-950/50",   text: "text-blue-600 dark:text-blue-400" },
        ].map(({ label, interval, bg, text }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <div className={`w-full rounded-lg ${bg} py-2 text-center`}>
              <span className={`text-[9px] font-semibold ${text}`}>{label}</span>
            </div>
            <span className="text-[7px] text-muted-foreground">{interval}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
