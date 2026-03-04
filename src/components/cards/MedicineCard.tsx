/**
 * MedicineCard Component
 *
 * Specialized card type for medicine / medical studies mode.
 * Handles five sub-types stored in card.type:
 *   - med_definition   : Medical definition (term → definition + key elements)
 *   - med_presentation : Clinical presentation (disease → symptoms & signs)
 *   - med_diagnosis    : Diagnostic reasoning (presentation → possible diagnoses)
 *   - med_treatment    : Treatment (disease → treatment & management)
 *   - med_clinical_case: Clinical case (scenario → diagnosis + explanation)
 *
 * Review flow (same as LawCard):
 * 1. FRONT: Display the term / disease / presentation / scenario
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

interface MedicineCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

// ─── Section helper ────────────────────────────────────────────────────────────

function Section({
  labelKey,
  value,
  color,
}: {
  labelKey: string;
  value: string | undefined | null;
  color: string;
}) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <div className="mb-5">
      <span
        className={`inline-block px-3 py-1 text-xs font-medium rounded-full uppercase tracking-wider mb-2 ${color}`}
      >
        {t(labelKey)}
      </span>
      <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-line">
        {value}
      </p>
    </div>
  );
}

// ─── Sub-renderers ─────────────────────────────────────────────────────────────

function MedDefinitionBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      <Section
        labelKey="medicineCard.definition"
        value={extra?.definition}
        color="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
      />
      <Section
        labelKey="medicineCard.keyElements"
        value={extra?.keyElements}
        color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
      />
      <Section
        labelKey="medicineCard.example"
        value={extra?.example}
        color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
      />
    </div>
  );
}

function MedPresentationBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      <Section
        labelKey="medicineCard.symptoms"
        value={extra?.symptoms}
        color="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
      />
      <Section
        labelKey="medicineCard.signs"
        value={extra?.signs}
        color="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
      />
      <Section
        labelKey="medicineCard.notes"
        value={extra?.notes}
        color="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
      />
    </div>
  );
}

function MedDiagnosisBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      <Section
        labelKey="medicineCard.diagnoses"
        value={extra?.diagnoses}
        color="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
      />
      <Section
        labelKey="medicineCard.notes"
        value={extra?.notes}
        color="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
      />
    </div>
  );
}

function MedTreatmentBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-xl md:text-2xl font-semibold leading-relaxed"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      <Section
        labelKey="medicineCard.firstLine"
        value={extra?.firstLine}
        color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
      />
      <Section
        labelKey="medicineCard.alternatives"
        value={extra?.alternatives}
        color="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
      />
      <Section
        labelKey="medicineCard.lifestyle"
        value={extra?.lifestyle}
        color="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
      />
    </div>
  );
}

function MedClinicalCaseBack({
  front,
  extra,
}: {
  front: string;
  extra: Record<string, string> | null;
}) {
  return (
    <div className="flex min-h-full flex-col p-8 md:p-10">
      <div className="mb-6 pb-4 border-b border-border/50">
        <div
          className="text-base md:text-lg leading-relaxed italic text-foreground/80"
          dangerouslySetInnerHTML={{ __html: front }}
        />
      </div>
      <Section
        labelKey="medicineCard.diagnosis"
        value={extra?.diagnosis}
        color="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
      />
      <Section
        labelKey="medicineCard.explanation"
        value={extra?.explanation}
        color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
      />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MedicineCard({
  card,
  onRate,
  intervalPreviews,
  ratingFlash,
}: MedicineCardProps) {
  const { t } = useTranslation();
  const [showBack, setShowBack] = useState(false);

  const extra = card.extra as Record<string, string> | null;

  // Reset state when card changes
  useEffect(() => {
    setShowBack(false);
  }, [card.id, card.state, card.due_at]);

  // Keyboard shortcuts (mirrors LawCard)
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
        if (showBack) onRate("good");
        else setShowBack(true);
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
      case "med_definition":
        return <MedDefinitionBack front={card.front} extra={extra} />;
      case "med_presentation":
        return <MedPresentationBack front={card.front} extra={extra} />;
      case "med_diagnosis":
        return <MedDiagnosisBack front={card.front} extra={extra} />;
      case "med_treatment":
        return <MedTreatmentBack front={card.front} extra={extra} />;
      case "med_clinical_case":
        return <MedClinicalCaseBack front={card.front} extra={extra} />;
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
          {/* Front face */}
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

          {/* Back face — structured content */}
          <Card
            className="absolute inset-0 w-full overflow-hidden shadow-lg border-border/50"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
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
