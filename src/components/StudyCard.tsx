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
import { BasicCard } from "@/components/cards/BasicCard";
import { ReversibleCard } from "@/components/cards/ReversibleCard";
import { TypedCard } from "@/components/cards/TypedCard";
import type { CardType as CardTypeEnum } from "@/lib/card-types";

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
  const [pendingCount, setPendingCount] = useState(0);
  const [waitingUntil, setWaitingUntil] = useState<Date | null>(null);
  const queuedIds = useRef<Set<string>>(new Set(initialCards.map((c) => c.id)));
  const pendingCards = useRef<Map<string, CardType>>(new Map());
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitting = useRef(false);

  // Derive currentCard safely
  const currentCard = queue[currentIndex] ?? null;
  const currentDeck = currentCard && deckMap ? deckMap.get(currentCard.deck_id) : null;

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
        const updatedCard = await reviewCard(cardId, rating);
        console.log("✅ reviewCard completed successfully");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("soma-counts-updated"));
        }

        // THEN update UI
        const withoutCurrent = queue.filter((_, i) => i !== currentIndex);
        let newQueue: CardType[] = [];
        let newIndex = currentIndex;
        const updatedDueAt = new Date(updatedCard.due_at).getTime();
        const nowMs = Date.now();
        const isLearningState =
          updatedCard.state === "learning" || updatedCard.state === "relearning";
        const shouldRequeueSoon = updatedDueAt <= nowMs + 60_000;

        if (isLearningState && shouldRequeueSoon) {
          const REINSERT_AFTER_VAL = Math.min(3, withoutCurrent.length);
          const insertAt = Math.min(
            withoutCurrent.length,
            currentIndex + REINSERT_AFTER_VAL
          );

          newQueue = [
            ...withoutCurrent.slice(0, insertAt),
            updatedCard as CardType,
            ...withoutCurrent.slice(insertAt),
          ];

          queuedIds.current.add(currentCard.id);

          // Handle case when this was the last card - reinserted card becomes index 0
          if (withoutCurrent.length === 0) {
            newIndex = 0;
          } else {
            newIndex = Math.min(currentIndex, withoutCurrent.length - 1);
          }
        } else if (isLearningState && !shouldRequeueSoon) {
          pendingCards.current.set(updatedCard.id, updatedCard as CardType);
          setPendingCount(pendingCards.current.size);
          newQueue = withoutCurrent;
          queuedIds.current.delete(updatedCard.id);

          if (withoutCurrent.length === 0) {
            newIndex = 0;
          } else if (currentIndex >= withoutCurrent.length) {
            newIndex = withoutCurrent.length - 1;
          } else {
            newIndex = currentIndex;
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
          if (pendingCards.current.size === 0) {
            setCurrentIndex(0);
            onComplete?.();
          } else {
            setCurrentIndex(0);
          }
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

  useEffect(() => {
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }

    if (queue.length > 0 || pendingCards.current.size === 0) {
      setWaitingUntil(null);
      return;
    }

    const pendingList = Array.from(pendingCards.current.values());
    const nextDue = pendingList.reduce((min, card) => {
      const due = new Date(card.due_at).getTime();
      return Math.min(min, due);
    }, Number.POSITIVE_INFINITY);

    if (!Number.isFinite(nextDue)) {
      setWaitingUntil(null);
      return;
    }

    setWaitingUntil(new Date(nextDue));
    const delay = Math.max(0, nextDue - Date.now());
    pendingTimer.current = setTimeout(() => {
      const nowMs = Date.now();
      const ready: CardType[] = [];
      for (const [id, card] of pendingCards.current.entries()) {
        if (new Date(card.due_at).getTime() <= nowMs) {
          ready.push(card);
          pendingCards.current.delete(id);
        }
      }

      if (ready.length > 0) {
        setQueue(ready);
        setCurrentIndex(0);
      }
      setPendingCount(pendingCards.current.size);
    }, delay);

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };
  }, [queue]);

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

  // Note: Keyboard shortcuts are now handled by individual card type components
  // to support different interaction patterns (e.g., typed cards need input focus)

  // Calculate interval previews when card changes
  // Each card type component decides when to display them
  useEffect(() => {
    if (!currentCard) {
      setIntervalPreviews(null);
      return;
    }

    async function loadPreviews() {
      if (!currentCard) return;

      try {
        const settings = await getSettings();
        const schedulerSettings = {
          starting_ease: settings.starting_ease || 2.5,
          easy_bonus: settings.easy_bonus || 1.3,
          hard_interval: settings.hard_interval || 1.2,
        };

        const previews = previewIntervals(currentCard, schedulerSettings);
        setIntervalPreviews(previews);
      } catch (error) {
        console.error("Error loading interval previews:", error);
        setIntervalPreviews(null);
      }
    }

    loadPreviews();
  }, [currentCard]);

  if (queue.length === 0 || !currentCard) {
    if (pendingCount > 0) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-8 relative">
          <div className="absolute top-6 left-6 z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                router.push("/decks");
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Decks
            </Button>
          </div>
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-3">
            <p className="text-xl font-medium">Waiting for cards to become due</p>
            {waitingUntil && (
              <p className="text-sm text-muted-foreground">
                Next card at {waitingUntil.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      );
    }

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
        <div className="mx-auto flex max-w-3xl w-full flex-col items-center space-y-8 pt-16">
          {error && (
            <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Dispatch to appropriate card type component */}
          {(() => {
            // Get card type, defaulting to 'basic' for backward compatibility
            const cardType = (currentCard.type as CardTypeEnum) || "basic";

            switch (cardType) {
              case "reversible":
                return (
                  <ReversibleCard
                    card={currentCard}
                    onRate={handleRate}
                    intervalPreviews={intervalPreviews}
                    ratingFlash={ratingFlash}
                  />
                );

              case "typed":
                return (
                  <TypedCard
                    card={currentCard}
                    onRate={handleRate}
                    intervalPreviews={intervalPreviews}
                    ratingFlash={ratingFlash}
                  />
                );

              case "basic":
              default:
                return (
                  <BasicCard
                    card={currentCard}
                    onRate={handleRate}
                    intervalPreviews={intervalPreviews}
                    ratingFlash={ratingFlash}
                  />
                );
            }
          })()}
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
