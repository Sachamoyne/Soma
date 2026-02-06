/**
 * PhilosophyConceptCard Component
 *
 * Specialized card type for philosophy concepts (Humanities mode).
 *
 * Review flow:
 * 1. FRONT: Display ONLY the concept name (e.g., "Le Cogito")
 * 2. User clicks to reveal
 * 3. BACK: Display structured fields: Author, Work, Date, Explanation, Example
 * 4. User rates their recall
 *
 * All structured data is stored in the card's `extra` JSONB field.
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Card as CardType, IntervalPreview } from "@/lib/db";
import { useTranslation } from "@/i18n";

interface PhilosophyConceptCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

export function PhilosophyConceptCard({
  card,
  onRate,
  intervalPreviews,
  ratingFlash,
}: PhilosophyConceptCardProps) {
  const { t } = useTranslation();
  const [showBack, setShowBack] = useState(false);

  // Get structured data from extra field
  const extra = card.extra as {
    author?: string;
    work?: string;
    date?: string;
    explanation?: string;
    example?: string;
  } | null;

  const author = extra?.author;
  const work = extra?.work;
  const date = extra?.date;
  const explanation = extra?.explanation;
  const example = extra?.example;

  // Reset state when card changes
  useEffect(() => {
    setShowBack(false);
  }, [card.id, card.state, card.due_at]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === " " && !showBack) {
        e.preventDefault();
        setShowBack(true);
        return;
      }
      if (e.key === " " && showBack) {
        e.preventDefault();
        onRate("good");
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (showBack) {
          onRate("good");
        } else {
          setShowBack(true);
        }
        return;
      }

      if (showBack) {
        if (e.key === "1") {
          e.preventDefault();
          onRate("again");
        } else if (e.key === "2") {
          e.preventDefault();
          onRate("hard");
        } else if (e.key === "3") {
          e.preventDefault();
          onRate("good");
        } else if (e.key === "4") {
          e.preventDefault();
          onRate("easy");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showBack, onRate]);

  return (
    <>
      {/* Card container */}
      <div
        className="relative w-full"
        onClick={() => {
          if (!showBack) setShowBack(true);
        }}
      >
        <div
          className="relative w-full h-[min(60vh,600px)] min-h-[280px]"
          style={{
            transformStyle: "preserve-3d",
            transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.3s ease-in-out",
          }}
        >
          {/* Front face - CONCEPT ONLY */}
          <Card
            className="absolute inset-0 w-full overflow-hidden shadow-lg border-border/50"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(0deg)",
            }}
          >
            <CardContent className="h-full overflow-y-auto p-0">
              <div className="flex min-h-full items-center justify-center p-12">
                <div className="text-center max-w-2xl">
                  <div
                    className="text-3xl md:text-4xl font-semibold leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: card.front }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Back face - STRUCTURED FIELDS */}
          <Card
            className="absolute inset-0 w-full overflow-hidden shadow-lg border-border/50"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <CardContent className="h-full overflow-y-auto p-0">
              <div className="flex min-h-full flex-col p-8 md:p-10">
                {/* Concept name (header) */}
                <div className="mb-6 pb-4 border-b border-border/50">
                  <div
                    className="text-xl md:text-2xl font-semibold leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: card.front }}
                  />
                </div>

                {/* Metadata row: Author / Work / Date */}
                {(author || work || date) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
                    {author && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {t("philosophyCard.author")}
                        </span>
                        <p className="text-base font-medium mt-0.5">{author}</p>
                      </div>
                    )}
                    {work && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {t("philosophyCard.work")}
                        </span>
                        <p className="text-base font-medium italic mt-0.5">{work}</p>
                      </div>
                    )}
                    {date && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {t("philosophyCard.date")}
                        </span>
                        <p className="text-base font-medium mt-0.5">{date}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Explanation */}
                {explanation && (
                  <div className="mb-6">
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full uppercase tracking-wider">
                        {t("philosophyCard.explanation")}
                      </span>
                    </div>
                    <div
                      className="text-base leading-relaxed text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: explanation }}
                    />
                  </div>
                )}

                {/* Example */}
                {example && (
                  <div>
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full uppercase tracking-wider">
                        {t("philosophyCard.example")}
                      </span>
                    </div>
                    <div
                      className="text-base leading-relaxed text-foreground/80 italic"
                      dangerouslySetInnerHTML={{ __html: example }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xl">
        {!showBack ? (
          <Button
            onClick={() => setShowBack(true)}
            size="lg"
            className="h-14 text-base"
          >
            {t("study.showAnswer")}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button
              onClick={() => onRate("again")}
              size="lg"
              className={cn(
                "transition-all flex flex-col h-auto py-4 bg-red-600/80 hover:bg-red-600 text-white",
                ratingFlash === "again" && "scale-105 ring-2 ring-red-500"
              )}
            >
              <span className="font-medium">{t("study.again")}</span>
              {intervalPreviews && (
                <span className="text-xs opacity-70 mt-1">
                  {intervalPreviews.again}
                </span>
              )}
            </Button>
            <Button
              onClick={() => onRate("hard")}
              size="lg"
              className={cn(
                "transition-all flex flex-col h-auto py-4 bg-orange-600/80 hover:bg-orange-600 text-white",
                ratingFlash === "hard" && "scale-105 ring-2 ring-orange-500"
              )}
            >
              <span className="font-medium">{t("study.hard")}</span>
              {intervalPreviews && (
                <span className="text-xs opacity-70 mt-1">
                  {intervalPreviews.hard}
                </span>
              )}
            </Button>
            <Button
              onClick={() => onRate("good")}
              size="lg"
              className={cn(
                "transition-all flex flex-col h-auto py-4 bg-yellow-600/80 hover:bg-yellow-600 text-white",
                ratingFlash === "good" && "scale-105 ring-2 ring-yellow-500"
              )}
            >
              <span className="font-medium">{t("study.good")}</span>
              {intervalPreviews && (
                <span className="text-xs opacity-70 mt-1">
                  {intervalPreviews.good}
                </span>
              )}
            </Button>
            <Button
              onClick={() => onRate("easy")}
              size="lg"
              className={cn(
                "transition-all flex flex-col h-auto py-4 bg-green-600/80 hover:bg-green-600 text-white",
                ratingFlash === "easy" && "scale-105 ring-2 ring-green-500"
              )}
            >
              <span className="font-medium">{t("study.easy")}</span>
              {intervalPreviews && (
                <span className="text-xs opacity-70 mt-1">
                  {intervalPreviews.easy}
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
