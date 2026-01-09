"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StudyCard } from "@/components/StudyCard";
import { getDueCards, getDeckPath, listDecks } from "@/store/decks";
import { getEffectiveDeckSettings } from "@/store/deck-settings";
import type { Deck } from "@/lib/db";

export default function DeckStudyPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [deckPath, setDeckPath] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDueCards() {
      try {
        // ✅ CRITICAL FIX: Get EFFECTIVE settings for this deck
        // This resolves: deck overrides → global settings (if null)
        const effectiveSettings = await getEffectiveDeckSettings(deckId);

        console.log("📊 Study Session - Effective Settings:", {
          deckId,
          newCardsPerDay: effectiveSettings.newCardsPerDay,
          maxReviewsPerDay: effectiveSettings.maxReviewsPerDay,
        });

        // ✅ Calculate session limit based on EFFECTIVE daily limits
        // Learning/relearning cards have no daily limit (use 1000 as reasonable cap)
        // Review cards: maxReviewsPerDay (respects deck override or global)
        // New cards: newCardsPerDay (respects deck override or global)
        const sessionLimit = 1000 + (effectiveSettings.maxReviewsPerDay || 9999) + (effectiveSettings.newCardsPerDay || 20);

        console.log("📊 Study Session - Calculated Limit:", {
          learningCap: 1000,
          reviewLimit: effectiveSettings.maxReviewsPerDay,
          newLimit: effectiveSettings.newCardsPerDay,
          totalSessionLimit: sessionLimit,
        });

        const [allDecks, dueCards, path] = await Promise.all([
          listDecks(),
          getDueCards(deckId, sessionLimit),
          getDeckPath(deckId),
        ]);

        console.log("📊 Study Session - Cards Loaded:", {
          requestedLimit: sessionLimit,
          cardsReturned: dueCards.length,
          breakdown: {
            new: dueCards.filter((c) => c.state === "new").length,
            learning: dueCards.filter((c) => c.state === "learning" || c.state === "relearning").length,
            review: dueCards.filter((c) => c.state === "review").length,
          },
        });

        const loadedDeck = allDecks.find((d) => d.id === deckId);
        if (!loadedDeck) {
          router.push("/decks");
          return;
        }

        if (dueCards.length === 0) {
          router.push(`/decks/${deckId}`);
          return;
        }

        setDeck(loadedDeck);
        setCards(dueCards);
        setDeckPath(path);
      } catch (error) {
        console.error("Error loading due cards:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDueCards();
  }, [deckId, router]);

  if (loading || !deck) {
    return (
      <>
        <div className="flex-1 overflow-y-auto p-10">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  return (
    <StudyCard
      initialCards={cards}
      title={deckPath}
      deckId={deckId}
      onComplete={() => router.push(`/decks/${deckId}`)}
    />
  );
}
