/**
 * PropertyCard Component
 *
 * Specialized card type for mathematical properties and theorems.
 * 
 * Review flow (Active Recall of Hypotheses):
 * 1. Display theorem name ONLY
 * 2. User types hypotheses from memory (not evaluated)
 * 3. User reveals the card
 * 4. Display correct hypotheses + result
 * 5. Optionally show explanation/proof (extra.explanation)
 * 
 * This enforces active recall - hypotheses are NOT shown upfront.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { Card as CardType, IntervalPreview } from "@/lib/db";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/i18n";

interface PropertyCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

export function PropertyCard({
  card,
  onRate,
  intervalPreviews,
  ratingFlash,
}: PropertyCardProps) {
  const { t } = useTranslation();
  const [showResult, setShowResult] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  // User's typed hypotheses (for active recall - not persisted or evaluated)
  const [userHypotheses, setUserHypotheses] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get structured data from extra field
  const extra = card.extra as { theoremName?: string; explanation?: string } | null;
  const theoremName = extra?.theoremName;
  const explanation = extra?.explanation;

  // Reset state when card changes
  useEffect(() => {
    setShowResult(false);
    setShowExplanation(false);
    setUserHypotheses("");
  }, [card.id, card.state, card.due_at]);

  // Focus textarea when card loads (for better UX)
  useEffect(() => {
    if (!showResult && textareaRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [card.id, showResult]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Space or Enter: reveal result if not shown
      if ((e.key === " " || e.key === "Enter") && !showResult) {
        e.preventDefault();
        setShowResult(true);
        return;
      }

      // Space: Good rating if result visible
      if (e.key === " " && showResult) {
        e.preventDefault();
        onRate("good");
        return;
      }

      // Enter: Good rating if result visible
      if (e.key === "Enter" && showResult) {
        e.preventDefault();
        onRate("good");
        return;
      }

      // Rating keys (only work when result is visible)
      if (showResult) {
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
  }, [showResult, onRate]);

  return (
    <>
      {/* Card container */}
      <div className="relative w-full">
        <Card className="w-full min-h-[400px] shadow-lg border-border/50">
          <CardContent className="flex min-h-[400px] flex-col p-8 md:p-12">
            {/* PHASE 1: Question - Theorem name + User input for hypotheses */}
            {!showResult && (
              <div className="flex-1 flex flex-col">
                {/* Theorem name (always visible) */}
                {theoremName && (
                  <div className="mb-8">
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full uppercase tracking-wider">
                        {t("propertyCard.theoremName")}
                      </span>
                    </div>
                    <div
                      className="text-2xl md:text-3xl font-semibold leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: theoremName }}
                    />
                  </div>
                )}

                {/* Active recall: User types hypotheses from memory */}
                <div className="flex-1 flex flex-col">
                  <div className="mb-3">
                    <span className="inline-block px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full uppercase tracking-wider">
                      {t("propertyCard.recallHypotheses")}
                    </span>
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={userHypotheses}
                    onChange={(e) => setUserHypotheses(e.target.value)}
                    placeholder={t("propertyCard.hypothesesPlaceholder")}
                    className="flex-1 min-h-[150px] text-lg resize-none"
                    onKeyDown={(e) => {
                      // Cmd/Ctrl + Enter to reveal
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        setShowResult(true);
                      }
                    }}
                  />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("propertyCard.recallHint")}
                  </p>
                </div>
              </div>
            )}

            {/* PHASE 2: Reveal - Show correct hypotheses + result */}
            {showResult && (
              <div className="flex-1">
                {/* Theorem name */}
                {theoremName && (
                  <div className="mb-6">
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full uppercase tracking-wider">
                        {t("propertyCard.theoremName")}
                      </span>
                    </div>
                    <div
                      className="text-2xl md:text-3xl font-semibold leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: theoremName }}
                    />
                  </div>
                )}

                {/* User's answer (for comparison) */}
                {userHypotheses.trim() && (
                  <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                    <div className="mb-2">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded uppercase tracking-wider">
                        {t("propertyCard.yourAnswer")}
                      </span>
                    </div>
                    <div className="text-base text-muted-foreground whitespace-pre-wrap">
                      {userHypotheses}
                    </div>
                  </div>
                )}

                {/* Correct hypotheses */}
                <div className="mb-6">
                  <div className="mb-3">
                    <span className="inline-block px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full uppercase tracking-wider">
                      {t("propertyCard.hypotheses")}
                    </span>
                  </div>
                  <div
                    className="text-xl md:text-2xl leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                    dangerouslySetInnerHTML={{ __html: card.front }}
                  />
                  {/* Helper text */}
                  <p className="mt-3 text-sm text-muted-foreground italic">
                    {t("propertyCard.compareHint")}
                  </p>
                </div>

                {/* Result / Statement */}
                <div className="pt-6 border-t border-border/50">
                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full uppercase tracking-wider">
                      {t("propertyCard.result")}
                    </span>
                  </div>
                  <div
                    className="text-2xl md:text-3xl leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                    dangerouslySetInnerHTML={{ __html: card.back }}
                  />
                </div>

                {/* Explanation toggle (if available) */}
                {explanation && (
                  <div className="mt-6">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowExplanation(!showExplanation);
                      }}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showExplanation ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {t("propertyCard.showExplanation")}
                    </button>

                    {showExplanation && (
                      <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                        <div className="mb-2">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded uppercase tracking-wider">
                            {t("propertyCard.explanation")}
                          </span>
                        </div>
                        <div
                          className="text-base leading-relaxed text-muted-foreground [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                          dangerouslySetInnerHTML={{ __html: explanation }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xl">
        {!showResult ? (
          <Button
            onClick={() => setShowResult(true)}
            size="lg"
            className="h-14 text-base"
          >
            {t("propertyCard.revealAnswer")}
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
