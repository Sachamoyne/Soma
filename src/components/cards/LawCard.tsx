/**
 * LawCard Component
 *
 * Specialized card type for law / legal studies mode.
 * Handles three sub-types stored in card.type:
 *   - statute_article : Article de loi
 *   - case_brief      : Fiche d'arrêt
 *   - practical_case  : Cas pratique
 *
 * Review flow (same as PhilosophyConceptCard):
 * 1. FRONT: Display only the identifier (article ref / case id / question)
 * 2. User clicks / presses Space or Enter to reveal
 * 3. BACK: Display structured fields from card.extra
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

interface LawCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

// ─── Structured back renderers ────────────────────────────────────────────────

function StatuteArticleBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      {extra?.articleText && (
        <div className="mb-5">
          <span className="inline-block px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full uppercase tracking-wider mb-2">
            {t("lawCard.articleText")}
          </span>
          <p className="text-base leading-relaxed text-foreground/90 italic">
            {extra.articleText}
          </p>
        </div>
      )}
      {extra?.conditions && (
        <div className="mb-5">
          <span className="inline-block px-3 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full uppercase tracking-wider mb-2">
            {t("lawCard.conditions")}
          </span>
          <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
            {extra.conditions}
          </p>
        </div>
      )}
      {extra?.pitfalls && (
        <div className="mb-5">
          <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full uppercase tracking-wider mb-2">
            {t("lawCard.pitfalls")}
          </span>
          <p className="text-base leading-relaxed text-foreground/80 whitespace-pre-line">
            {extra.pitfalls}
          </p>
        </div>
      )}
      {extra?.example && (
        <div>
          <span className="inline-block px-3 py-1 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full uppercase tracking-wider mb-2">
            {t("lawCard.example")}
          </span>
          <p className="text-base leading-relaxed text-foreground/80 italic whitespace-pre-line">
            {extra.example}
          </p>
        </div>
      )}
    </div>
  );
}

function CaseBriefBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  const sections: Array<{ key: string; labelKey: string; color: string }> = [
    { key: "facts",     labelKey: "lawCard.facts",     color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
    { key: "procedure", labelKey: "lawCard.procedure", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
    { key: "problem",   labelKey: "lawCard.problem",   color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
    { key: "solution",  labelKey: "lawCard.solution",  color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
    { key: "scope",     labelKey: "lawCard.scope",     color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" },
  ];
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      {sections.map(({ key, labelKey, color }) =>
        extra?.[key as string] ? (
          <div key={key as string} className="mb-5">
            <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full uppercase tracking-wider mb-2 ${color}`}>
              {t(labelKey)}
            </span>
            <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
              {extra[key as string]}
            </p>
          </div>
        ) : null
      )}
    </div>
  );
}

function PracticalCaseBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  const sections: Array<{ key: string; labelKey: string; color: string }> = [
    { key: "qualification", labelKey: "lawCard.qualification", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
    { key: "rules",         labelKey: "lawCard.rules",         color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" },
    { key: "application",   labelKey: "lawCard.application",   color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
    { key: "conclusion",    labelKey: "lawCard.conclusion",    color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
  ];
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      {sections.map(({ key, labelKey, color }) =>
        extra?.[key] ? (
          <div key={key} className="mb-5">
            <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full uppercase tracking-wider mb-2 ${color}`}>
              {t(labelKey)}
            </span>
            <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
              {extra[key]}
            </p>
          </div>
        ) : null
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LawCard({ card, onRate, intervalPreviews, ratingFlash }: LawCardProps) {
  const { t } = useTranslation();
  const [showBack, setShowBack] = useState(false);

  const extra = card.extra as Record<string, string> | null;

  // Reset state when card changes
  useEffect(() => {
    setShowBack(false);
  }, [card.id, card.state, card.due_at]);

  // Keyboard shortcuts (mirrors PhilosophyConceptCard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === " " && !showBack) { e.preventDefault(); setShowBack(true); return; }
      if (e.key === " " && showBack)  { e.preventDefault(); onRate("good"); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        if (showBack) onRate("good"); else setShowBack(true);
        return;
      }
      if (showBack) {
        if (e.key === "1") { e.preventDefault(); onRate("again"); }
        else if (e.key === "2") { e.preventDefault(); onRate("hard"); }
        else if (e.key === "3") { e.preventDefault(); onRate("good"); }
        else if (e.key === "4") { e.preventDefault(); onRate("easy"); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showBack, onRate]);

  const renderBack = () => {
    switch (card.type) {
      case "statute_article":
        return <StatuteArticleBack front={card.front} extra={extra} />;
      case "case_brief":
        return <CaseBriefBack front={card.front} extra={extra} />;
      case "practical_case":
        return <PracticalCaseBack front={card.front} extra={extra} />;
      default:
        return (
          <div className="flex min-h-full items-center justify-center p-12">
            <div
              className="text-xl leading-relaxed text-center"
              dangerouslySetInnerHTML={{ __html: card.back }}
            />
          </div>
        );
    }
  };

  return (
    <>
      {/* Card container */}
      <div
        className="relative w-full"
        onClick={() => { if (!showBack) setShowBack(true); }}
      >
        <div
          className="relative w-full h-[min(60vh,600px)] min-h-[280px]"
          style={{
            transformStyle: "preserve-3d",
            transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.3s ease-in-out",
          }}
        >
          {/* Front face */}
          <Card
            className="absolute inset-0 w-full overflow-hidden shadow-lg border-border/50"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(0deg)" }}
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

          {/* Back face — structured content */}
          <Card
            className="absolute inset-0 w-full overflow-hidden shadow-lg border-border/50"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <CardContent className="h-full overflow-y-auto p-0">
              {renderBack()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xl">
        {!showBack ? (
          <Button onClick={() => setShowBack(true)} size="lg" className="h-14 text-base">
            {t("study.showAnswer")}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button
              onClick={() => onRate("again")}
              size="lg"
              className={cn("transition-all flex flex-col h-auto py-4 bg-red-600/80 hover:bg-red-600 text-white", ratingFlash === "again" && "scale-105 ring-2 ring-red-500")}
            >
              <span className="font-medium">{t("study.again")}</span>
              {intervalPreviews && <span className="text-xs opacity-70 mt-1">{intervalPreviews.again}</span>}
            </Button>
            <Button
              onClick={() => onRate("hard")}
              size="lg"
              className={cn("transition-all flex flex-col h-auto py-4 bg-orange-600/80 hover:bg-orange-600 text-white", ratingFlash === "hard" && "scale-105 ring-2 ring-orange-500")}
            >
              <span className="font-medium">{t("study.hard")}</span>
              {intervalPreviews && <span className="text-xs opacity-70 mt-1">{intervalPreviews.hard}</span>}
            </Button>
            <Button
              onClick={() => onRate("good")}
              size="lg"
              className={cn("transition-all flex flex-col h-auto py-4 bg-yellow-600/80 hover:bg-yellow-600 text-white", ratingFlash === "good" && "scale-105 ring-2 ring-yellow-500")}
            >
              <span className="font-medium">{t("study.good")}</span>
              {intervalPreviews && <span className="text-xs opacity-70 mt-1">{intervalPreviews.good}</span>}
            </Button>
            <Button
              onClick={() => onRate("easy")}
              size="lg"
              className={cn("transition-all flex flex-col h-auto py-4 bg-green-600/80 hover:bg-green-600 text-white", ratingFlash === "easy" && "scale-105 ring-2 ring-green-500")}
            >
              <span className="font-medium">{t("study.easy")}</span>
              {intervalPreviews && <span className="text-xs opacity-70 mt-1">{intervalPreviews.easy}</span>}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
