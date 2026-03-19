"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAppRouter } from "@/hooks/useAppRouter";
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
  getDueCards,
  getDueCount,
  updateCard,
  suspendCard,
  previewIntervals,
  reviewCardBackground,
} from "@/store/decks";
import { getSettings } from "@/lib/supabase-db";
import { gradeCard } from "@/lib/scheduler";
import type { SchedulerSettings, SchedulingResult } from "@/lib/scheduler";
import type { Card as CardType, Deck, IntervalPreview } from "@/lib/db";
import { Edit, Pause, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCardTimer } from "@/hooks/useCardTimer";
import { BasicCard } from "@/components/cards/BasicCard";
import { ReversibleCard } from "@/components/cards/ReversibleCard";
import { TypedCard } from "@/components/cards/TypedCard";
import { PhilosophyConceptCard } from "@/components/cards/PhilosophyConceptCard";
import { LawCard } from "@/components/cards/LawCard";
import { MedicineCard } from "@/components/cards/MedicineCard";
import { DiagramCard } from "@/components/cards/DiagramCard";
import type { CardType as CardTypeEnum } from "@/lib/card-types";

// Session requeue to mimic Anki learning behavior
// Cards marked "Again" reappear in the same session after a short delay
const REINSERT_AFTER = 3;

// Background prefetch: keep the queue stocked so transitions stay instant
const PREFETCH_THRESHOLD = 10; // start fetching when queue drops below this
const PREFETCH_BATCH_SIZE = 40; // how many cards to pull per background fetch

const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  starting_ease: 2.5,
  easy_bonus: 1.3,
  hard_interval: 1.2,
};

/**
 * Fire-and-forget DB sync with retry. Called after the UI has already
 * advanced to the next card — the user never waits for this.
 */
async function syncReviewAsync(
  cardId: string,
  deckId: string,
  rating: "again" | "hard" | "good" | "easy",
  result: SchedulingResult,
  previousState: string,
  previousInterval: number,
  elapsedMs: number,
  now: Date
): Promise<void> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await reviewCardBackground(cardId, deckId, rating, result, previousState, previousInterval, elapsedMs, now);
      return;
    } catch (err) {
      console.error(`❌ Background sync attempt ${attempt + 1} failed:`, err);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  console.error("❌ Background sync failed after all retries. Review data may not have been saved.");
}

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
  const router = useAppRouter();
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
  const isMounted = useRef(true);
  const queuedIds = useRef<Set<string>>(new Set(initialCards.map((c) => c.id)));
  const pendingCards = useRef<Map<string, CardType>>(new Map());
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitting = useRef(false);
  const isRequeueing = useRef(false);
  const cardTimer = useCardTimer();
  // Cached scheduler settings — loaded once at session start, defaults used until then
  const cachedSettings = useRef<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS);
  // Prefetch bookkeeping: track every card ID touched this session to prevent duplicates
  const sessionCardIds = useRef<Set<string>>(new Set(initialCards.map((c) => c.id)));
  const isPrefetching = useRef(false);
  const hasMoreCards = useRef(true); // set to false when a prefetch returns no new cards

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

  // Mark as unmounted to prevent async requeue updates after navigation.
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load scheduler settings once at session start — used for instant local SRS computation
  useEffect(() => {
    getSettings().then((settings) => {
      cachedSettings.current = {
        starting_ease: settings.starting_ease || 2.5,
        easy_bonus: settings.easy_bonus || 1.3,
        hard_interval: settings.hard_interval || 1.2,
      };
    }).catch(() => {
      // Keep defaults on error
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Background prefetch: silently load more cards before the queue runs dry
  const prefetchMore = useCallback(async () => {
    if (isPrefetching.current || !hasMoreCards.current) return;
    isPrefetching.current = true;
    try {
      const newCards = await getDueCards(deckId, PREFETCH_BATCH_SIZE);
      // Filter out any card already seen in this session (in queue, pending, or answered)
      const fresh = newCards.filter((c) => !sessionCardIds.current.has(c.id));
      if (fresh.length === 0) {
        // Quota exhausted — no more cards will be due until tomorrow
        hasMoreCards.current = false;
      } else {
        fresh.forEach((c) => sessionCardIds.current.add(c.id));
        setQueue((prev) => [...prev, ...fresh]);
      }
    } catch (err) {
      console.error("Background prefetch failed:", err);
    } finally {
      isPrefetching.current = false;
    }
  }, [deckId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger prefetch when the visible queue drops below the threshold
  useEffect(() => {
    if (queue.length > 0 && queue.length < PREFETCH_THRESHOLD && hasMoreCards.current) {
      prefetchMore();
    }
  }, [queue.length, prefetchMore]);

  // Reset card timer when the current card changes
  useEffect(() => {
    if (currentCard) {
      cardTimer.reset();
    }
  }, [currentCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRate = useCallback(
    (rating: "again" | "hard" | "good" | "easy") => {
      if (!currentCard) return;

      // Prevent double submit
      if (isSubmitting.current) {
        console.warn("⚠️ Already submitting, ignoring duplicate rate");
        return;
      }

      isSubmitting.current = true;

      const now = new Date();
      const nowMs = now.getTime();
      const elapsedMs = cardTimer.getElapsed();
      const previousState = currentCard.state;
      const previousInterval = currentCard.interval_days;

      // ── Step 1: Compute SRS locally — instant, no network ─────────────────
      const result = gradeCard(currentCard, rating, cachedSettings.current, now);

      // Build the locally updated card object for queue management
      const updatedCard: CardType = {
        ...currentCard,
        state: result.state,
        due_at: result.due_at.toISOString(),
        interval_days: result.interval_days,
        ease: Number(result.ease.toFixed(2)),
        learning_step_index: result.learning_step_index,
        reps: result.reps,
        lapses: result.lapses,
        last_reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      // ── Step 2: Update queue state immediately ─────────────────────────────
      const withoutCurrent = queue.filter((_, i) => i !== currentIndex);
      let newQueue: CardType[] = [];
      let newIndex = currentIndex;
      const updatedDueAt = result.due_at.getTime();
      const isLearningState =
        result.state === "learning" || result.state === "relearning";
      const shouldRequeueSoon = updatedDueAt <= nowMs + 90_000; // 90s covers the 1-minute learning step with margin

      if (isLearningState && shouldRequeueSoon) {
        const REINSERT_AFTER_VAL = Math.min(3, withoutCurrent.length);
        const insertAt = Math.min(
          withoutCurrent.length,
          currentIndex + REINSERT_AFTER_VAL
        );

        newQueue = [
          ...withoutCurrent.slice(0, insertAt),
          updatedCard,
          ...withoutCurrent.slice(insertAt),
        ];

        queuedIds.current.add(currentCard.id);

        if (withoutCurrent.length === 0) {
          newIndex = 0;
        } else {
          newIndex = Math.min(currentIndex, withoutCurrent.length - 1);
        }
      } else if (isLearningState && !shouldRequeueSoon) {
        pendingCards.current.set(updatedCard.id, updatedCard);
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

      setQueue(newQueue);
      setShowBack(false);

      // Visual feedback
      setRatingFlash(rating);
      setTimeout(() => setRatingFlash(null), 200);

      if (newQueue.length === 0) {
        if (pendingCards.current.size === 0) {
          setCurrentIndex(0);
          // Local queue is empty: before ending the session, re-check the DB
          // for any card that is due now / quasi-now (especially Learning due soon).
          // This prevents the "return to deck overview between learning steps" bug.
          if (!isRequeueing.current) {
            isRequeueing.current = true;
            void (async () => {
              try {
                const freshDue = await getDueCards(
                  deckId,
                  PREFETCH_BATCH_SIZE
                );

                if (!isMounted.current) return;

                if (freshDue.length > 0) {
                  queuedIds.current = new Set(freshDue.map((c) => c.id));
                  freshDue.forEach((c) => sessionCardIds.current.add(c.id));
                  pendingCards.current.clear();
                  setPendingCount(0);
                  setQueue(freshDue);
                  setShowBack(false);
                  setCurrentIndex(0);
                } else {
                  onComplete?.();
                }
              } catch (err) {
                console.error("[STUDY CARD] Reload due cards failed:", err);
                if (isMounted.current) onComplete?.();
              } finally {
                isRequeueing.current = false;
              }
            })();
          }
        } else {
          setCurrentIndex(0);
        }
      } else {
        setCurrentIndex(Math.min(newIndex, Math.max(0, newQueue.length - 1)));
      }

      // Release the lock immediately — next card is ready
      isSubmitting.current = false;

      // Dispatch counts update for sidebar/badges
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("soma-counts-updated"));
      }

      // ── Step 3: Persist to Supabase in the background ─────────────────────
      syncReviewAsync(
        currentCard.id,
        currentCard.deck_id,
        rating,
        result,
        previousState,
        previousInterval,
        elapsedMs,
        now
      );
    },
    [queue, currentIndex, currentCard, onComplete] // eslint-disable-line react-hooks/exhaustive-deps
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

  // Calculate interval previews when card changes — uses cached settings, no async needed
  useEffect(() => {
    if (!currentCard) {
      setIntervalPreviews(null);
      return;
    }
    setIntervalPreviews(previewIntervals(currentCard, cachedSettings.current));
  }, [currentCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (queue.length === 0 || !currentCard) {
    if (pendingCount > 0) {
      return (
        <div className="flex h-full w-full flex-col">
          <div className="flex-shrink-0 px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/decks")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Decks
            </Button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-3">
              <p className="text-xl font-medium">Waiting for cards to become due</p>
              {waitingUntil && (
                <p className="text-sm text-muted-foreground">
                  Next card at {waitingUntil.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex-shrink-0 px-4 py-3">
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
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6">
            <p className="text-xl font-medium">Study session complete</p>
            <p className="text-muted-foreground">No cards remaining</p>
          </div>
        </div>
      </div>
    );
  }

  // Computed here so JSX can branch on it without re-computing inside the switch
  const currentCardType = (currentCard.type as CardTypeEnum) || "basic";

  return (
    <>
      <div className="flex h-full w-full flex-col">
        {/* Header row: back button | deck title + count | edit/suspend */}
        <div className="flex-shrink-0 flex items-center px-4 py-3">
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

          <div className="flex-1 text-center">
            <h1 className="text-sm font-normal text-muted-foreground">
              {title}
            </h1>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {queue.length} card{queue.length !== 1 ? "s" : ""} remaining
            </p>
          </div>

          <div className="flex gap-2 opacity-40 hover:opacity-100 transition-opacity">
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
        </div>

        {/* Error banner — shown above content regardless of card type */}
        {error && (
          <div className="flex-shrink-0 px-6 pb-2">
            <div className="w-full max-w-3xl mx-auto rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          </div>
        )}

        {currentCardType === "diagram" ? (
          // ── Diagram: full-height container, DiagramCard manages scroll + sticky buttons ──
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <DiagramCard
              card={currentCard}
              onRate={handleRate}
              intervalPreviews={intervalPreviews}
              ratingFlash={ratingFlash}
            />
          </div>
        ) : (
          // ── All other card types: vertically centered, standard layout ──
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 min-h-0">
            <div className="mx-auto flex max-w-3xl w-full flex-col items-center space-y-6">
            {/* Dispatch to appropriate card type component */}
            {(() => {
              switch (currentCardType) {
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

                case "philosophy_concept":
                  return (
                    <PhilosophyConceptCard
                      card={currentCard}
                      onRate={handleRate}
                      intervalPreviews={intervalPreviews}
                      ratingFlash={ratingFlash}
                    />
                  );

                case "statute_article":
                case "case_brief":
                case "practical_case":
                  return (
                    <LawCard
                      card={currentCard}
                      onRate={handleRate}
                      intervalPreviews={intervalPreviews}
                      ratingFlash={ratingFlash}
                    />
                  );

                case "med_definition":
                case "med_presentation":
                case "med_diagnosis":
                case "med_treatment":
                case "med_clinical_case":
                  return (
                    <MedicineCard
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
        )}
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
