"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Trash2, Sparkles } from "lucide-react";
import { getAnkiCountsForDecks, deleteDeck } from "@/store/decks";
import { useTranslation } from "@/i18n";
import { PaywallModal } from "@/components/PaywallModal";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { useUserPlan } from "@/hooks/useUserPlan";

interface CardPreview {
  front: string;
  back: string;
  tags?: string[];
  difficulty?: number;
}

interface GenerateResponse {
  deck_id: string;
  imported: number;
  cards: CardPreview[];
}

export default function DeckOverviewPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;
  const [loading, setLoading] = useState(true);
  const [cardCounts, setCardCounts] = useState<{
    new: number;
    learning: number;
    review: number;
  }>({ new: 0, learning: 0, review: 0 });
  const [totalCards, setTotalCards] = useState(0);

  // Local state for AI card generation, scoped to this deck
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<GenerateResponse | null>(null);

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

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"free_plan" | "quota_exceeded">("free_plan");
  const [paywallPlan, setPaywallPlan] = useState<"starter" | "pro" | undefined>(undefined);

  // Get user plan to check AI access
  const userPlan = useUserPlan();
  const canUseAI = userPlan?.canUseAI ?? false;

  const canGenerateWithAI = aiText.trim().length > 0 && !aiLoading && canUseAI;

  const handleGenerateWithAI = async () => {
    if (!canGenerateWithAI) return;

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    try {
      const response = await fetch("/api/generate-cards", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deck_id: String(deckId),
          language: "fr",
          text: aiText.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle quota errors
        if (data.error === "QUOTA_FREE_PLAN" || data.error === "QUOTA_EXCEEDED") {
          setPaywallReason(data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded");
          setPaywallPlan(data.plan === "starter" ? "starter" : data.plan === "pro" ? "pro" : undefined);
          setPaywallOpen(true);
          return;
        }
        setAiError(data.error || "Failed to generate cards");
        return;
      }

      setAiResult(data);
      setAiText("");

      // Trigger a refresh of deck counts elsewhere in the app
      window.dispatchEvent(new Event("soma-counts-updated"));
    } catch (error) {
      console.error("Error generating AI cards:", error);
      setAiError(
        error instanceof Error ? error.message : "Failed to generate cards"
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="flex justify-center">
        <div className="grid grid-cols-3 gap-16 py-8">
          <div className="text-center">
            <div className="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-3">
              {cardCounts.new}
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.new")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-6xl font-bold text-orange-600 dark:text-orange-400 mb-3">
              {cardCounts.learning}
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.learning")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-6xl font-bold text-green-600 dark:text-green-400 mb-3">
              {cardCounts.review}
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
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
            className="px-16 py-7 text-lg font-semibold shadow-lg"
          >
            <BookOpen className="mr-3 h-6 w-6" />
            {t("deckOverview.studyNow")}
          </Button>
        ) : totalCards === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg mb-3">
              {t("deckOverview.emptyDeck")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("deckOverview.emptyDeckHint", { add: t("deckOverview.add") })}
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground mb-2">
              {t("deckOverview.congratulations")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("deckOverview.allUpToDate")}
            </p>
          </div>
        )}
      </div>

      {/* AI card generation – scoped to this deck only */}
      <div className="pt-12 border-t max-w-3xl mx-auto">
        <div className="rounded-xl border bg-muted/30 p-6 space-y-5">
          {/* Quota Indicator */}
          <QuotaIndicator />

          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                Générer des cartes avec l&apos;IA
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Colle un extrait de cours, un article ou des notes.
              L&apos;IA va créer automatiquement des flashcards pertinentes pour ce paquet.
            </p>
          </div>

          {/* Input */}
          <div className="space-y-4">
            <Textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={6}
              className="bg-background"
              placeholder={
                !canUseAI
                  ? "Fonctionnalité réservée aux abonnés. Passez à Starter ou Pro pour utiliser l'IA."
                  : `Exemple :
– un cours
– un chapitre de livre
– des notes prises en classe
– un article

Plus le texte est clair, meilleures seront les cartes.`
              }
              disabled={!canUseAI}
            />
            {!canUseAI ? (
              <div className="rounded-lg border border-muted bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Fonctionnalité réservée aux abonnés
              </div>
            ) : (
              <Button
                onClick={handleGenerateWithAI}
                disabled={!canGenerateWithAI}
                className="w-full"
                size="lg"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {aiLoading ? "Génération en cours…" : "Générer des cartes pour ce paquet"}
              </Button>
            )}
          </div>

          {/* Error state */}
          {aiError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              {aiError}
            </div>
          )}

          {/* Success state */}
          {aiResult && (
            <div className="space-y-4">
              {/* Success message */}
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  ✓ {aiResult.imported} cartes ont été ajoutées à ce paquet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tu peux les modifier, les supprimer ou commencer à les réviser immédiatement.
                </p>
              </div>

              {/* Card previews - max 5 with scroll */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Aperçu des cartes générées
                </p>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {aiResult.cards.slice(0, 5).map((card, index) => (
                    <div
                      key={index}
                      className="rounded-lg border bg-card p-4 space-y-3"
                    >
                      <div>
                        <p className="text-xs font-medium text-primary mb-1">Question</p>
                        <p className="text-sm">{card.front}</p>
                      </div>
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Réponse</p>
                        <p className="text-sm text-muted-foreground">{card.back}</p>
                      </div>
                    </div>
                  ))}
                  {aiResult.cards.length > 5 && (
                    <p className="text-xs text-center text-muted-foreground py-2">
                      + {aiResult.cards.length - 5} autres cartes
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason={paywallReason}
        plan={paywallPlan}
      />

      <div className="pt-12 border-t flex justify-center">
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
