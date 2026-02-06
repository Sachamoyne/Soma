/**
 * TypedCard Component
 *
 * Fill-in card: user must type the answer to proceed
 * Answer validation: case-insensitive, trimmed, exact match
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { isAnswerCorrect } from "@/lib/card-types";
import type { Card as CardType, IntervalPreview } from "@/lib/db";
import { CheckCircle2, XCircle } from "lucide-react";

interface TypedCardProps {
  card: CardType;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
  intervalPreviews: IntervalPreview | null;
  ratingFlash: string | null;
}

export function TypedCard({
  card,
  onRate,
  intervalPreviews,
  ratingFlash,
}: TypedCardProps) {
  const [userAnswer, setUserAnswer] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when card changes
  useEffect(() => {
    setUserAnswer("");
    setIsSubmitted(false);
    setIsCorrect(false);
    // Auto-focus input on card load
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [card.id, card.state, card.due_at]);

  const handleSubmit = () => {
    if (!userAnswer.trim()) return;

    const correct = isAnswerCorrect(userAnswer, card.back);
    setIsCorrect(correct);
    setIsSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitted) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Strip HTML tags for display (typed cards expect plain text answers)
  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const expectedAnswer = stripHtml(card.back);

  return (
    <>
      {/* Card container */}
      <div className="relative w-full">
        <Card className="w-full h-[min(50vh,500px)] min-h-[280px] overflow-hidden shadow-lg border-border/50">
          <CardContent className="h-full overflow-y-auto p-0">
            <div className="flex min-h-full flex-col items-center justify-center p-12 gap-8">
              {/* Question */}
              <div className="text-center max-w-2xl">
                <div
                  className="text-3xl leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_img]:rounded-md [&_img]:shadow-sm"
                  dangerouslySetInnerHTML={{ __html: card.front }}
                />
              </div>

              {/* Input field */}
              {!isSubmitted ? (
                <div className="w-full max-w-md">
                  <Input
                    ref={inputRef}
                    type="text"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer..."
                    className="text-lg h-12 text-center"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Press Enter to submit
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-md space-y-4">
                  {/* User's answer with feedback */}
                  <div
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2",
                      isCorrect
                        ? "bg-green-50 dark:bg-green-950/20 border-green-500"
                        : "bg-red-50 dark:bg-red-950/20 border-red-500"
                    )}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Your answer:</p>
                      <p className="font-medium">{userAnswer}</p>
                    </div>
                  </div>

                  {/* Correct answer (if wrong) */}
                  {!isCorrect && (
                    <div className="p-4 rounded-lg bg-muted/50 border">
                      <p className="text-sm text-muted-foreground">Correct answer:</p>
                      <p className="font-medium text-lg">{expectedAnswer}</p>
                    </div>
                  )}

                  {/* Success message (if correct) */}
                  {isCorrect && (
                    <p className="text-center text-sm text-green-600 dark:text-green-400">
                      Correct! Rate how well you knew this card.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xl">
        {!isSubmitted ? (
          <Button
            onClick={handleSubmit}
            size="lg"
            className="h-14 text-base"
            disabled={!userAnswer.trim()}
          >
            Submit answer
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
