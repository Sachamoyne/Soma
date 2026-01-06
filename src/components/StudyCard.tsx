"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  reviewCard,
  getDueCount,
  updateCard,
  suspendCard,
  previewIntervals,
} from "@/store/decks";
import { getSettings } from "@/lib/supabase-db";
import type { Card as CardType, Deck, IntervalPreview } from "@/lib/db";
import { Edit, Pause, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

// Session requeue to mimic Anki learning behavior
// Cards marked "Again" reappear in the same session after a short delay
const REINSERT_AFTER = 3;

interface StudyCardProps {
  initialCards: CardType[];
  deckMap?: Map<string, Deck>;
  title: string;
  deckId: string;
  onComplete?: () => void;
}

export function StudyCard({
  initialCards,
  deckMap,
  title,
  deckId,
  onComplete,
}: StudyCardProps) {
  const router = useRouter();
  const [queue, setQueue] = useState<CardType[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [intervalPreviews, setIntervalPreviews] = useState<IntervalPreview | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [ratingFlash, setRatingFlash] = useState<string | null>(null);
  const queuedIds = useRef<Set<string>>(new Set(initialCards.map((c) => c.id)));
  const isSubmitting = useRef(false);

  // Derive currentCard safely
  const currentCard = queue[currentIndex] ?? null;
  const currentDeck = currentCard && deckMap ? deckMap.get(currentCard.deckId) : null;

  // Debug: Log card HTML to verify image tags
  useEffect(() => {
    if (currentCard) {
      console.log("[STUDY CARD] Front HTML:", currentCard.front);
      console.log("[STUDY CARD] Back HTML:", currentCard.back);

      // Check for image tags
      const frontHasImg = /<img/i.test(currentCard.front);
      const backHasImg = /<img/i.test(currentCard.back);

      if (frontHasImg || backHasImg) {
        console.log("[STUDY CARD] Card contains images:", { frontHasImg, backHasImg });

        // Extract img src values
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        const frontMatches = [...currentCard.front.matchAll(imgRegex)];
        const backMatches = [...currentCard.back.matchAll(imgRegex)];

        if (frontMatches.length > 0) {
          console.log("[STUDY CARD] Front image sources:", frontMatches.map(m => m[1]));
        }
        if (backMatches.length > 0) {
          console.log("[STUDY CARD] Back image sources:", backMatches.map(m => m[1]));
        }
      }
    }
  }, [currentCard]);

  const handleRate = useCallback(
    async (rating: "again" | "hard" | "good" | "easy") => {
      if (!currentCard) return;

      // Prevent double submit
      if (isSubmitting.current) {
        console.warn("⚠️ Already submitting, ignoring duplicate rate");
        return;
      }

      isSubmitting.current = true;
      const cardId = currentCard.id;
      const previousState = currentCard.state;

      console.log("🔵 handleRate START", { cardId, rating, previousState });

      try {
        // Persist review FIRST - wait for completion
        await reviewCard(cardId, rating);
        console.log("✅ reviewCard completed successfully");

        // THEN update UI
        const withoutCurrent = queue.filter((_, i) => i !== currentIndex);
        let newQueue: CardType[] = [];
        let newIndex = currentIndex;

        if (rating === "again") {
          const REINSERT_AFTER_VAL = Math.min(3, withoutCurrent.length);
          const insertAt = Math.min(
            withoutCurrent.length,
            currentIndex + REINSERT_AFTER_VAL
          );

          newQueue = [
            ...withoutCurrent.slice(0, insertAt),
            currentCard,
            ...withoutCurrent.slice(insertAt),
          ];

          queuedIds.current.add(currentCard.id);

          // Handle case when this was the last card - reinserted card becomes index 0
          if (withoutCurrent.length === 0) {
            newIndex = 0;
          } else {
            newIndex = Math.min(currentIndex, withoutCurrent.length - 1);
          }
        } else {
          newQueue = withoutCurrent;
          queuedIds.current.delete(currentCard.id);

          if (withoutCurrent.length === 0) {
            newIndex = 0;
          } else if (currentIndex >= withoutCurrent.length) {
            newIndex = withoutCurrent.length - 1;
          } else {
            newIndex = currentIndex;
          }
        }

        // Update state immediately
        setQueue(newQueue);
        setShowBack(false);

        // Visual feedback (non-blocking)
        setRatingFlash(rating);
        setTimeout(() => setRatingFlash(null), 200);

        // Advance to next card immediately
        if (newQueue.length === 0) {
          setCurrentIndex(0);
          onComplete?.();
        } else {
          setCurrentIndex(Math.min(newIndex, Math.max(0, newQueue.length - 1)));
        }

        console.log("🔵 handleRate END - success");
      } catch (err) {
        console.error("❌ Error in handleRate:", err);
        setError(err instanceof Error ? err.message : "Failed to review card");
      } finally {
        isSubmitting.current = false;
      }
    },
    [queue, currentIndex, currentCard, onComplete, deckId]
  );

  const handleEditCard = () => {
    if (!currentCard) return;
    setEditFront(currentCard.front);
    setEditBack(currentCard.back);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!currentCard || !editFront.trim() || !editBack.trim()) return;

    try {
      await updateCard(currentCard.id, editFront.trim(), editBack.trim());
      // Update card in queue
      const updatedQueue = queue.map((card) =>
        card.id === currentCard.id
          ? { ...card, front: editFront.trim(), back: editBack.trim() }
          : card
      );
      setQueue(updatedQueue);
      setEditDialogOpen(false);
    } catch (err) {
      console.error("Error updating card:", err);
      setError(err instanceof Error ? err.message : "Failed to update card");
    }
  };

  const handleSuspendCard = async () => {
    if (!currentCard) return;

    try {
      await suspendCard(currentCard.id);
      // Remove from queue
      const newQueue = queue.filter((_, i) => i !== currentIndex);
      setQueue(newQueue);
      setShowBack(false);

      if (newQueue.length === 0) {
        setCurrentIndex(0);
        onComplete?.();
      } else {
        setCurrentIndex(Math.min(currentIndex, Math.max(0, newQueue.length - 1)));
      }
    } catch (err) {
      console.error("Error suspending card:", err);
      setError(err instanceof Error ? err.message : "Failed to suspend card");
    }
  };

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

      if (!currentCard) return;

      // Space: show answer if front visible
      if (e.key === " " && !showBack) {
        e.preventDefault();
        setShowBack(true);
        return;
      }

      // Enter: Easy rating if back visible, otherwise same as Space
      // This mimics Anki behavior where Enter = Easy (not Good)
      if (e.key === "Enter") {
        e.preventDefault();
        if (showBack) {
          handleRate("easy");
        } else {
          setShowBack(true);
        }
        return;
      }

      // Rating keys (only work when back is visible)
      if (showBack) {
        if (e.key === "1") {
          e.preventDefault();
          handleRate("again");
        } else if (e.key === "2") {
          e.preventDefault();
          handleRate("hard");
        } else if (e.key === "3") {
          e.preventDefault();
          handleRate("good");
        } else if (e.key === "4") {
          e.preventDefault();
          handleRate("easy");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showBack, currentCard, handleRate]);

  // Calculate interval previews when card changes or back is shown
  useEffect(() => {
    if (!currentCard || !showBack) {
      setIntervalPreviews(null);
      return;
    }

    async function loadPreviews() {
      if (!currentCard) return;

      try {
        const settings = await getSettings();
        const schedulerSettings = {
          learning_steps: settings.learning_steps,
          relearning_steps: settings.relearning_steps,
          graduating_interval_days: settings.graduating_interval_days,
          easy_interval_days: settings.easy_interval_days,
          starting_ease: settings.starting_ease,
          easy_bonus: settings.easy_bonus,
          hard_interval: settings.hard_interval,
          interval_modifier: settings.interval_modifier,
          new_interval_multiplier: settings.new_interval_multiplier,
          minimum_interval_days: settings.minimum_interval_days,
          maximum_interval_days: settings.maximum_interval_days,
          again_delay_minutes: settings.again_delay_minutes,
        };

        const previews = previewIntervals(currentCard, schedulerSettings);
        setIntervalPreviews(previews);
      } catch (error) {
        console.error("Error loading interval previews:", error);
        setIntervalPreviews(null);
      }
    }

    loadPreviews();
  }, [currentCard, showBack]);

  if (queue.length === 0 || !currentCard) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 relative">
        {/* Back to Decks button - top left */}
        <div className="absolute top-6 left-6 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log("[STUDY CARD] Back to Decks clicked (completion screen)");
              try {
                router.push("/decks");
              } catch (error) {
                console.error("[STUDY CARD] Navigation error:", error);
              }
            }}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Decks
          </Button>
        </div>

        {/* Completion message */}
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6">
          <p className="text-xl font-medium">Study session complete</p>
          <p className="text-muted-foreground">No cards remaining</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full flex-col items-center justify-center p-8 relative">
        {/* Back to Decks button - top left */}
        <div className="absolute top-6 left-6 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log("[STUDY CARD] Back to Decks clicked (study screen)");
              try {
                router.push("/decks");
              } catch (error) {
                console.error("[STUDY CARD] Navigation error:", error);
              }
            }}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Decks
          </Button>
        </div>

        {/* Minimal header - deck name + remaining cards */}
        <div className="absolute top-6 left-0 right-0 text-center">
          <h1 className="text-sm font-normal text-muted-foreground">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {queue.length} card{queue.length !== 1 ? "s" : ""} remaining
          </p>
        </div>

        {/* Subtle action icons in top-right corner */}
        <div className="absolute top-6 right-6 flex gap-2 opacity-40 hover:opacity-100 transition-opacity">
          <Tooltip content="Edit card">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEditCard}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Suspend card">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSuspendCard}
              className="h-8 w-8"
            >
              <Pause className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>

        {/* Main content container */}
        <div className="mx-auto flex max-w-3xl w-full flex-col items-center justify-center space-y-8">
          {error && (
            <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Card container - larger, more breathing room */}
          <div className="relative w-full">
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
                      dangerouslySetInnerHTML={{ __html: currentCard.front }}
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
                      dangerouslySetInnerHTML={{ __html: currentCard.back }}
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
                disabled={!currentCard}
                className="h-14 text-base"
              >
                Show answer
              </Button>
            ) : (
              currentCard && (
                <div className="grid grid-cols-2 gap-3 w-full">
                  <Button
                    variant="destructive"
                    onClick={() => handleRate("again")}
                    size="lg"
                    className={cn(
                      "transition-all flex flex-col h-auto py-4",
                      ratingFlash === "again" && "scale-105 ring-2 ring-destructive"
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
                    variant="outline"
                    onClick={() => handleRate("hard")}
                    size="lg"
                    className={cn(
                      "transition-all flex flex-col h-auto py-4",
                      ratingFlash === "hard" && "scale-105 ring-2 ring-ring"
                    )}
                  >
                    <span className="font-medium">Hard</span>
                    {intervalPreviews?.hard && (
                      <span className="text-xs opacity-70 mt-1">
                        {intervalPreviews.hard}
                      </span>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleRate("good")}
                    size="lg"
                    className={cn(
                      "transition-all flex flex-col h-auto py-4",
                      ratingFlash === "good" && "scale-105 ring-2 ring-primary"
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
                    variant="secondary"
                    onClick={() => handleRate("easy")}
                    size="lg"
                    className={cn(
                      "transition-all flex flex-col h-auto py-4",
                      ratingFlash === "easy" && "scale-105 ring-2 ring-secondary"
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
              )
            )}
          </div>
        </div>
      </div>

      {/* Edit card dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
            <DialogDescription>
              Update the front and back of this card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Front</label>
              <Textarea
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Back</label>
              <Textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

