/**
 * DiagramCard Component
 *
 * Cross-mode card type for diagram/schema labeling.
 * Review flow:
 * 1. Show image with numbered markers (answers hidden)
 * 2. User fills in an answer input for each marker
 * 3. Click "Vérifier" → each input turns green/red + correct answers revealed
 * 4. Rating buttons appear
 *
 * Structured data is stored in card.extra:
 *   { image_url: string, markers: Array<{ id, x, y, answer }> }
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { Card as CardType, IntervalPreview } from "@/lib/db";
import { useTranslation } from "@/i18n";

interface DiagramMarker {
  id: number;
  x: number;
  y: number;
  answer: string;
}

interface DiagramExtra {
  image_url: string;
  markers: DiagramMarker[];
}

interface DiagramCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

export function DiagramCard({ card, onRate, intervalPreviews, ratingFlash }: DiagramCardProps) {
  const { t } = useTranslation();
  const extra = card.extra as DiagramExtra | null;
  const markers = extra?.markers ?? [];

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({});

  // Reset state when card changes
  useEffect(() => {
    setAnswers({});
    setChecked(false);
    setResults({});
  }, [card.id, card.state, card.due_at]);

  const handleCheck = () => {
    const newResults: Record<number, boolean> = {};
    for (const marker of markers) {
      const userAnswer = (answers[marker.id] ?? "").trim().toLowerCase();
      const correct = marker.answer.trim().toLowerCase();
      newResults[marker.id] = userAnswer === correct;
    }
    setResults(newResults);
    setChecked(true);
  };

  // Keyboard shortcuts (only active after checking)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;
      if (!checked) {
        if (e.key === "Enter") { e.preventDefault(); handleCheck(); }
        return;
      }
      if (e.key === "1") { e.preventDefault(); onRate("again"); }
      else if (e.key === "2") { e.preventDefault(); onRate("hard"); }
      else if (e.key === "3") { e.preventDefault(); onRate("good"); }
      else if (e.key === "4") { e.preventDefault(); onRate("easy"); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); onRate("good"); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [checked, onRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const allCorrect = checked && markers.length > 0 && Object.values(results).every(Boolean);

  const markerColor = (markerId: number) => {
    if (!checked) return "bg-blue-500";
    return results[markerId] ? "bg-green-500" : "bg-red-500";
  };

  return (
    <>
      {/* Card */}
      <Card className="w-full shadow-lg border-border/50">
        <CardContent className="p-6 space-y-5">
          {/* Title */}
          {card.front && (
            <div
              className="text-xl font-semibold text-center leading-relaxed"
              dangerouslySetInnerHTML={{ __html: card.front }}
            />
          )}

          {/* Image with numbered markers */}
          {extra?.image_url ? (
            <div className="relative w-full select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={extra.image_url}
                alt="Diagram"
                className="w-full rounded-md block"
                draggable={false}
              />
              {markers.map((marker, idx) => (
                <div
                  key={marker.id}
                  className={cn(
                    "absolute flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white shadow-md border-2 border-white pointer-events-none transition-colors",
                    markerColor(marker.id)
                  )}
                  style={{
                    left: `${marker.x * 100}%`,
                    top: `${marker.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t("diagramCard.noImage")}
            </div>
          )}

          {/* Answer inputs — one per marker */}
          {markers.length > 0 && (
            <div className="space-y-2">
              {markers.map((marker, idx) => (
                <div key={marker.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex items-center justify-center w-7 h-7 shrink-0 rounded-full text-xs font-bold text-white transition-colors",
                      markerColor(marker.id)
                    )}
                  >
                    {idx + 1}
                  </span>
                  <Input
                    value={answers[marker.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [marker.id]: e.target.value }))
                    }
                    placeholder={t("diagramCard.answerPlaceholder")}
                    disabled={checked}
                    className={cn(
                      "flex-1",
                      checked && results[marker.id] && "border-green-500 bg-green-50 dark:bg-green-900/20",
                      checked && !results[marker.id] && "border-red-500 bg-red-50 dark:bg-red-900/20"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !checked) {
                        e.preventDefault();
                        handleCheck();
                      }
                    }}
                  />
                  {/* Show correct answer when wrong */}
                  {checked && !results[marker.id] && (
                    <span className="text-sm text-green-700 dark:text-green-400 shrink-0 font-medium">
                      {marker.answer}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-4 w-full max-w-xl">
        {!checked ? (
          <Button
            onClick={handleCheck}
            size="lg"
            className="h-14 text-base"
            disabled={markers.length === 0}
          >
            {t("diagramCard.check")}
          </Button>
        ) : (
          <>
            {allCorrect && (
              <p className="text-center text-sm text-green-600 dark:text-green-400 font-medium">
                {t("diagramCard.allCorrect")}
              </p>
            )}
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
                  <span className="text-xs opacity-70 mt-1">{intervalPreviews.again}</span>
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
                  <span className="text-xs opacity-70 mt-1">{intervalPreviews.hard}</span>
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
                  <span className="text-xs opacity-70 mt-1">{intervalPreviews.good}</span>
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
                  <span className="text-xs opacity-70 mt-1">{intervalPreviews.easy}</span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
