"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/hooks/useAppRouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Trash2 } from "lucide-react";
import { getAnkiCountsForDecks, deleteDeck, invalidateCardCaches } from "@/store/decks";
import { useTranslation } from "@/i18n";

export default function DeckOverviewPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useAppRouter();
  const deckId = params.deckId as string;
  const [loading, setLoading] = useState(true);
  const [cardCounts, setCardCounts] = useState<{
    new: number;
    learning: number;
    review: number;
  }>({ new: 0, learning: 0, review: 0 });
  const [totalCards, setTotalCards] = useState(0);

  useEffect(() => {
    async function loadCounts() {
      try {
        const normalizedDeckId = String(deckId);
        const { due, total } = await getAnkiCountsForDecks([normalizedDeckId]);
        const counts = due[normalizedDeckId] || { new: 0, learning: 0, review: 0 };
        setCardCounts(counts);
        setTotalCards(total[normalizedDeckId] || 0);
      } catch (error) {
        console.error("Error loading card counts:", error);
      } finally {
        setLoading(false);
      }
    }

    loadCounts();
  }, [deckId]);

  useEffect(() => {
    const handleCountsUpdated = () => {
      setLoading(true);
      // Invalidate cache to get fresh data
      invalidateCardCaches();
      const normalizedDeckId = String(deckId);
      getAnkiCountsForDecks([normalizedDeckId])
        .then(({ due, total }) => {
          const counts = due[normalizedDeckId] || { new: 0, learning: 0, review: 0 };
          setCardCounts(counts);
          setTotalCards(total[normalizedDeckId] || 0);
        })
        .catch((error) => {
          console.error("Error loading card counts:", error);
        })
        .finally(() => {
          setLoading(false);
        });
    };
    window.addEventListener("soma-counts-updated", handleCountsUpdated);
    return () => {
      window.removeEventListener("soma-counts-updated", handleCountsUpdated);
    };
  }, [deckId]);

  const handleDeleteDeck = async () => {
    if (!confirm(t("deckOverview.deleteConfirm"))) return;

    try {
      const normalizedDeckId = String(deckId);
      await deleteDeck(normalizedDeckId);
      router.push("/decks");
    } catch (error) {
      console.error("Error deleting deck:", error);
    }
  };

  const handleStudy = () => {
    router.push(`/study/${String(deckId)}`);
  };

  const hasDueCards = (cardCounts.new + cardCounts.learning + cardCounts.review) > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-12">
      <div className="flex justify-center">
        <div className="grid grid-cols-3 gap-6 md:gap-16 py-4 md:py-8">
          <div className="text-center">
            <div className="text-4xl md:text-6xl font-bold text-blue-600 dark:text-blue-400 mb-1 md:mb-3">
              {cardCounts.new}
            </div>
            <div className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.new")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl md:text-6xl font-bold text-orange-600 dark:text-orange-400 mb-1 md:mb-3">
              {cardCounts.learning}
            </div>
            <div className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.learning")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl md:text-6xl font-bold text-green-600 dark:text-green-400 mb-1 md:mb-3">
              {cardCounts.review}
            </div>
            <div className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.toReview")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        {hasDueCards ? (
          <Button
            size="lg"
            onClick={handleStudy}
            className="px-10 py-5 md:px-16 md:py-7 text-base md:text-lg font-semibold shadow-lg"
          >
            <BookOpen className="mr-3 h-6 w-6" />
            {t("deckOverview.studyNow")}
          </Button>
        ) : totalCards === 0 ? (
          <div className="text-center py-6 md:py-12">
            <p className="text-muted-foreground text-lg mb-3">
              {t("deckOverview.emptyDeck")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("deckOverview.emptyDeckHint", { add: t("deckOverview.add") })}
            </p>
          </div>
        ) : (
          <div className="text-center py-6 md:py-12">
            <p className="text-xl text-muted-foreground mb-2">
              {t("deckOverview.congratulations")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("deckOverview.allUpToDate")}
            </p>
          </div>
        )}
      </div>

      <div className="pt-6 md:pt-12 border-t flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeleteDeck}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("deckOverview.deleteDeck")}
        </Button>
      </div>
    </div>
  );
}
