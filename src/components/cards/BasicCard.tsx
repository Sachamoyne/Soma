/**
 * BasicCard Component
 *
 * Standard flashcard behavior: front → back (press to reveal)
 * This is the default card type and matches the original behavior.
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Card as CardType, IntervalPreview } from "@/lib/db";

interface BasicCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

export function BasicCard({
  card,
  onRate,
  intervalPreviews,
  ratingFlash,
}: BasicCardProps) {
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setShowBack(false);
  }, [card.id, card.state, card.due_at]);

  // Keyboard shortcuts for basic card
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Space: show answer if front visible
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

      // Enter: Good rating if back visible, otherwise show back
      if (e.key === "Enter") {
        e.preventDefault();
        if (showBack) {
          onRate("good");
        } else {
          setShowBack(true);
        }
        return;
      }

      // Rating keys (only work when back is visible)
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
      {/* Card container with flip animation */}
      <div
        className="relative w-full"
        onClick={() => {
          if (!showBack) setShowBack(true);
        }}
      >
        <div
          className="relative w-full min-h-[400px]"
          style={{
            transformStyle: "preserve-3d",
            transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.3s ease-in-out",
          }}
        >
          {/* Front face */}
          <Card
            className="absolute inset-0 w-full min-h-[400px] shadow-lg border-border/50"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(0deg)",
            }}
          >
            <CardContent className="flex min-h-[400px] flex-col items-center justify-center p-12">
              <div className="text-center max-w-2xl">
                <div
                  className="text-3xl leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                  dangerouslySetInnerHTML={{ __html: card.front }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Back face */}
          <Card
            className="absolute inset-0 w-full min-h-[400px] shadow-lg border-border/50"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <CardContent className="flex min-h-[400px] flex-col items-center justify-center p-12">
              <div className="text-center max-w-2xl">
                <div
                  className="text-3xl leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                  dangerouslySetInnerHTML={{ __html: card.back }}
                />
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
            Show answer
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
              <span className="font-medium">Again</span>
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
              <span className="font-medium">Hard</span>
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
              <span className="font-medium">Good</span>
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
              <span className="font-medium">Easy</span>
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
