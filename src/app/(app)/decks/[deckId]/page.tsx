"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Trash2, Sparkles, FileText, Check, X, CheckCheck, XCircle } from "lucide-react";
import { getAnkiCountsForDecks, deleteDeck, invalidateCardCaches } from "@/store/decks";
import { useTranslation } from "@/i18n";
import { PaywallModal } from "@/components/PaywallModal";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { useUserPlan } from "@/hooks/useUserPlan";

// Import dynamique pour éviter les erreurs SSR
let pdfjsLib: any = null;

if (typeof window !== "undefined") {
  import("pdfjs-dist").then(async (pdfjs) => {
    pdfjsLib = pdfjs;
    // Set worker source to local file (copied by postinstall script)
    const workerMjs = "/pdf.worker.min.mjs";
    const workerJs = "/pdf.worker.min.js";
    
    try {
      const response = await fetch(workerMjs, { method: "HEAD" });
      if (response.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMjs;
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerJs;
      }
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerJs;
    }
    pdfjsLib.GlobalWorkerOptions.disableWorker = true;
  });
}

interface CardPreview {
  front: string;
  back: string;
  tags?: string[];
  difficulty?: number;
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

  // AI card generation state
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // New: Preview state (cards not yet confirmed)
  const [generatedCards, setGeneratedCards] = useState<CardPreview[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);

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

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"free_plan" | "quota_exceeded">("free_plan");
  const [paywallPlan, setPaywallPlan] = useState<"starter" | "pro" | undefined>(undefined);

  // Get user plan to check AI access
  const userPlan = useUserPlan();
  const canUseAI = userPlan?.canUseAI ?? false;

  const canGenerateWithAI = aiText.trim().length > 0 && !aiLoading && canUseAI;

  // Reset preview state
  const resetPreview = () => {
    setGeneratedCards(null);
    setSelectedIndices(new Set());
    setConfirmedCount(null);
    setAiError(null);
    setPdfError(null);
  };

  // Toggle card selection
  const toggleCard = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Select all cards
  const selectAll = () => {
    if (generatedCards) {
      setSelectedIndices(new Set(generatedCards.map((_, i) => i)));
    }
  };

  // Deselect all cards
  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  // Confirm and insert selected cards
  const handleConfirmCards = async () => {
    console.log("[handleConfirmCards] START", {
      hasGeneratedCards: !!generatedCards,
      generatedCardsLength: generatedCards?.length,
      selectedIndicesSize: selectedIndices.size,
      selectedIndices: Array.from(selectedIndices),
    });

    if (!generatedCards || selectedIndices.size === 0) {
      console.log("[handleConfirmCards] Early return - no cards or no selection");
      return;
    }

    setConfirmLoading(true);
    setAiError(null);

    try {
      const selectedCards = generatedCards.filter((_, index) => selectedIndices.has(index));

      console.log("[handleConfirmCards] Sending request", {
        deck_id: String(deckId),
        selectedCardsCount: selectedCards.length,
        selectedCards: selectedCards.map(c => ({ front: c.front.substring(0, 50) })),
      });

      const response = await fetch("/api/confirm-cards", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deck_id: String(deckId),
          cards: selectedCards,
        }),
      });

      console.log("[handleConfirmCards] Response received", {
        status: response.status,
        ok: response.ok,
      });

      const data = await response.json();
      console.log("[handleConfirmCards] Response data", data);

      if (!response.ok) {
        console.log("[handleConfirmCards] Response NOT OK, handling error");
        // Handle quota errors
        if (data.error === "QUOTA_FREE_PLAN" || data.error === "QUOTA_EXCEEDED") {
          setPaywallReason(data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded");
          setPaywallPlan(data.plan === "starter" ? "starter" : data.plan === "pro" ? "pro" : undefined);
          setPaywallOpen(true);
          return;
        }
        setAiError(data.message || data.error || "Erreur lors de la confirmation");
        return;
      }

      // Success!
      console.log("[handleConfirmCards] SUCCESS - imported:", data.imported);
      setConfirmedCount(data.imported);
      setGeneratedCards(null);
      setSelectedIndices(new Set());

      // Trigger a refresh of deck counts
      window.dispatchEvent(new Event("soma-counts-updated"));
    } catch (error) {
      console.error("[handleConfirmCards] CATCH error:", error);
      setAiError(error instanceof Error ? error.message : "Erreur lors de la confirmation");
    } finally {
      setConfirmLoading(false);
    }
  };

  /**
   * Extract text from PDF file using pdfjs-dist (client-side, Vercel-compatible)
   */
  const extractTextFromPDF = async (file: File): Promise<string> => {
    if (!pdfjsLib) {
      // Wait for pdfjs to load if not ready yet
      await new Promise<void>((resolve) => {
        const checkPdfjs = () => {
          if (pdfjsLib) {
            resolve();
          } else {
            setTimeout(checkPdfjs, 100);
          }
        };
        checkPdfjs();
      });
    }

    if (!pdfjsLib) {
      throw new Error("PDF.js n'est pas chargé. Veuillez réessayer.");
    }

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      let fullText = "";

      // Extract text from all pages
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str || "").join(" ");
        fullText += (fullText ? "\n\n" : "") + pageText;
      }

      return fullText.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle specific PDF errors
      if (errorMessage.includes("password") || errorMessage.includes("encrypted")) {
        throw new Error("Ce PDF est protégé par un mot de passe. Veuillez le déverrouiller avant de l'importer.");
      }
      
      if (errorMessage.includes("Invalid PDF") || errorMessage.includes("invalid")) {
        throw new Error("Ce fichier PDF semble corrompu ou mal formé. Veuillez essayer un autre fichier.");
      }
      
      throw new Error(`Impossible d'extraire le texte du PDF: ${errorMessage}`);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Type de fichier invalide. Veuillez sélectionner un fichier PDF.");
      return;
    }

    // Validate file size (15 MB)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setPdfError(`Le PDF est trop volumineux. Taille maximale : ${Math.round(MAX_SIZE / 1024 / 1024)} MB.`);
      return;
    }

    setPdfLoading(true);
    resetPreview();

    try {
      // Extract text from PDF client-side (Vercel-compatible)
      console.log("[handlePdfUpload] Extracting text from PDF client-side...");
      const extractedText = await extractTextFromPDF(file);
      
      if (!extractedText || extractedText.trim().length < 50) {
        setPdfError("Ce PDF ne contient pas de texte sélectionnable. Il s'agit probablement d'un PDF scanné (image). Veuillez utiliser un PDF avec du texte.");
        return;
      }

      console.log("[handlePdfUpload] Text extracted, length:", extractedText.length);

      // Send extracted text to generate-cards API (same as AI text)
      const response = await fetch("/api/generate-cards", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deck_id: String(deckId),
          language: "fr",
          text: extractedText.trim(),
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

        const errorMessage = data.message || data.error || "Échec de la génération de cartes depuis le PDF";
        setPdfError(errorMessage);
        return;
      }

      // Success - show preview (cards NOT inserted yet)
      setGeneratedCards(data.cards);
      // Select all by default
      setSelectedIndices(new Set(data.cards.map((_: any, i: number) => i)));
    } catch (error) {
      console.error("Error generating cards from PDF:", error);
      setPdfError(
        error instanceof Error ? error.message : "Failed to process PDF"
      );
    } finally {
      setPdfLoading(false);
      // Reset file input
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
    }
  };

  const handleGenerateWithAI = async () => {
    if (!canGenerateWithAI) return;

    setAiLoading(true);
    resetPreview();

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

      // Success - show preview (cards NOT inserted yet)
      setGeneratedCards(data.cards);
      // Select all by default
      setSelectedIndices(new Set(data.cards.map((_: any, i: number) => i)));
      setAiText("");
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

          {/* Input - hide when preview is showing */}
          {!generatedCards && (
            <div className="space-y-4">
              {/* PDF Upload Option */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    disabled={!canUseAI || pdfLoading || aiLoading}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                      !canUseAI || pdfLoading || aiLoading
                        ? "opacity-50 cursor-not-allowed border-muted bg-muted"
                        : "border-primary/20 bg-primary/5 hover:bg-primary/10"
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {pdfLoading ? "Traitement du PDF..." : "Importer un PDF"}
                    </span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Astuce : si vous ne pouvez pas sélectionner de texte dans le PDF, il s'agit probablement d'un PDF scanné.
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-muted/30 px-2 text-muted-foreground">Ou</span>
                </div>
              </div>

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
                  disabled={!canGenerateWithAI || pdfLoading}
                  className="w-full"
                  size="lg"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {aiLoading || pdfLoading
                    ? "Génération en cours…"
                    : "Générer des cartes pour ce paquet"}
                </Button>
              )}
            </div>
          )}

          {/* Error state */}
          {(aiError || pdfError) && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              {aiError || pdfError}
            </div>
          )}

          {/* Success state after confirmation */}
          {confirmedCount !== null && !generatedCards && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {confirmedCount} carte{confirmedCount > 1 ? "s ont été ajoutées" : " a été ajoutée"} à ce paquet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tu peux les modifier, les supprimer ou commencer à les réviser immédiatement.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setConfirmedCount(null)}
                className="w-full"
              >
                Générer d'autres cartes
              </Button>
            </div>
          )}

          {/* Preview state - cards generated but not confirmed */}
          {generatedCards && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  {generatedCards.length} carte{generatedCards.length > 1 ? "s générées" : " générée"} - Sélectionnez celles à ajouter
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Validez les cartes que vous souhaitez conserver. Les cartes non validées seront ignorées.
                </p>
              </div>

              {/* Global actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  className="flex-1"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Tout accepter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAll}
                  className="flex-1"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Tout refuser
                </Button>
              </div>

              {/* Card list with selection */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {selectedIndices.size} / {generatedCards.length} carte{selectedIndices.size > 1 ? "s sélectionnées" : " sélectionnée"}
                </p>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {generatedCards.map((card, index) => {
                    const isSelected = selectedIndices.has(index);
                    return (
                      <div
                        key={index}
                        className={`rounded-lg border p-4 space-y-3 transition-colors ${
                          isSelected
                            ? "border-green-500/50 bg-green-500/5"
                            : "border-muted bg-card opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-3">
                            <div>
                              <p className="text-xs font-medium text-primary mb-1">Question</p>
                              <p className="text-sm">{card.front}</p>
                            </div>
                            <div className="border-t pt-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Réponse</p>
                              <p className="text-sm text-muted-foreground">{card.back}</p>
                            </div>
                          </div>
                          {/* Accept/Reject button */}
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleCard(index)}
                            className={`shrink-0 ${
                              isSelected
                                ? "bg-green-600 hover:bg-green-700"
                                : "hover:border-destructive hover:text-destructive"
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <Check className="h-4 w-4" />
                              </>
                            ) : (
                              <>
                                <X className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm / Cancel actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={resetPreview}
                  disabled={confirmLoading}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleConfirmCards}
                  disabled={selectedIndices.size === 0 || confirmLoading}
                  className="flex-1"
                >
                  {confirmLoading ? (
                    "Ajout en cours..."
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Ajouter {selectedIndices.size} carte{selectedIndices.size > 1 ? "s" : ""}
                    </>
                  )}
                </Button>
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
