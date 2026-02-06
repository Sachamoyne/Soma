"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichCardInput } from "@/components/RichCardInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, PenLine, Sparkles } from "lucide-react";
import { createCard, invalidateDeckCaches, invalidateCardCaches, listDecks, type Deck } from "@/store/decks";
import { createClient } from "@/lib/supabase/client";
import { getCardTypesForMode, getDefaultCardTypeForMode, type CardType as CardTypeEnum } from "@/lib/card-types";
import type { DeckMode } from "@/lib/supabase-db";
import { ImportDialog } from "@/components/ImportDialog";
import { VocabularyImportDialog } from "@/components/VocabularyImportDialog";
import { AICardGenerator } from "@/components/AICardGenerator";
import { useTranslation } from "@/i18n";
import { Camera } from "lucide-react";

type CreationMode = "manual" | "ai";

export default function AddCardsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const supabase = createClient();
  const deckId = params.deckId as string;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [deckMode, setDeckMode] = useState<DeckMode>("classic");
  const [creationMode, setCreationMode] = useState<CreationMode>("manual");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [theoremName, setTheoremName] = useState(""); // For property cards - theorem name
  const [explanation, setExplanation] = useState(""); // For property cards - optional explanation
  // Philosophy concept fields
  const [conceptAuthor, setConceptAuthor] = useState("");
  const [conceptWork, setConceptWork] = useState("");
  const [conceptDate, setConceptDate] = useState("");
  const [conceptExplanation, setConceptExplanation] = useState("");
  const [conceptExample, setConceptExample] = useState("");
  const [cardType, setCardType] = useState<CardTypeEnum>("basic");
  const [creating, setCreating] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [vocabImportDialogOpen, setVocabImportDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if current type is property (needs special form)
  const isPropertyType = cardType === "property";
  const isPhilosophyConceptType = cardType === "philosophy_concept";

  // Load deck mode on mount
  useEffect(() => {
    async function loadDeck() {
      try {
        const decks = await listDecks();
        const foundDeck = decks.find((d) => d.id === deckId);
        if (foundDeck) {
          setDeck(foundDeck);
          if (foundDeck.mode) {
            setDeckMode(foundDeck.mode);
            // Set default card type based on mode
            setCardType(getDefaultCardTypeForMode(foundDeck.mode));
          }
        }
      } catch (error) {
        console.error("Error loading deck:", error);
      }
    }
    loadDeck();
  }, [deckId]);

  // Get card types for current deck mode
  const availableCardTypes = useMemo(() => getCardTypesForMode(deckMode), [deckMode]);

  const handleCreateCard = async () => {
    // Validation: property cards require theorem name
    if (isPropertyType && !theoremName.trim()) {
      return;
    }
    // Validation: philosophy_concept cards require concept (front)
    if (isPhilosophyConceptType) {
      if (!front.trim()) return;
    } else if (!front.trim() || !back.trim()) {
      return;
    }

    setCreating(true);
    setSuccessMessage(null);

    try {
      const normalizedDeckId = String(deckId);

      // Build extra field for property cards
      let extra: Record<string, string> | null = null;
      if (isPropertyType) {
        extra = {
          theoremName: theoremName.trim(),
        };
        if (explanation.trim()) {
          extra.explanation = explanation.trim();
        }
      }

      // Build extra field for philosophy concept cards
      if (isPhilosophyConceptType) {
        extra = {};
        if (conceptAuthor.trim()) extra.author = conceptAuthor.trim();
        if (conceptWork.trim()) extra.work = conceptWork.trim();
        if (conceptDate.trim()) extra.date = conceptDate.trim();
        if (conceptExplanation.trim()) extra.explanation = conceptExplanation.trim();
        if (conceptExample.trim()) extra.example = conceptExample.trim();
      }

      // For philosophy_concept, build a summary back from the structured fields
      let cardBack = back.trim();
      if (isPhilosophyConceptType) {
        const parts: string[] = [];
        if (conceptAuthor.trim()) parts.push(conceptAuthor.trim());
        if (conceptWork.trim()) parts.push(conceptWork.trim());
        if (conceptDate.trim()) parts.push(`(${conceptDate.trim()})`);
        if (conceptExplanation.trim()) parts.push(`— ${conceptExplanation.trim()}`);
        cardBack = parts.join(" ") || front.trim();
      }

      await createCard(normalizedDeckId, front.trim(), cardBack, cardType, supabase, extra);

      // Clear form
      setFront("");
      setBack("");
      setTheoremName("");
      setExplanation("");
      setConceptAuthor("");
      setConceptWork("");
      setConceptDate("");
      setConceptExplanation("");
      setConceptExample("");

      // Show success message
      setSuccessMessage(t("addCards.cardCreated"));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error creating card:", error);
      alert("Failed to create card. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to create card
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleCreateCard();
    }
  };

  const handleImportSuccess = () => {
    invalidateDeckCaches();
    invalidateCardCaches();
    setImportDialogOpen(false);
  };

  const handleVocabImportSuccess = () => {
    invalidateDeckCaches();
    invalidateCardCaches();
    setVocabImportDialogOpen(false);
  };

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header with title and mode toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{t("addCards.title")}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("addCards.subtitle")}
              </p>
            </div>
            <div className="flex gap-2">
              {/* Vocabulary import button for languages mode */}
              {deckMode === "languages" && deck && (
                <Button variant="outline" onClick={() => setVocabImportDialogOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  {t("vocabularyImport.title")}
                </Button>
              )}
              {creationMode === "ai" && (
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("addCards.importFromFile")}
                </Button>
              )}
            </div>
          </div>

          {/* Mode toggle buttons */}
          <div className="flex gap-2">
            <Button
              variant={creationMode === "manual" ? "default" : "outline"}
              onClick={() => setCreationMode("manual")}
              className="flex-1 sm:flex-none"
            >
              <PenLine className="mr-2 h-4 w-4" />
              {t("addCards.modeManual")}
            </Button>
            <Button
              variant={creationMode === "ai" ? "default" : "outline"}
              onClick={() => setCreationMode("ai")}
              className="flex-1 sm:flex-none"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("addCards.modeAI")}
            </Button>
          </div>
        </div>

        {/* Manual card creation */}
        {creationMode === "manual" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("addCards.newCard")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Success message */}
                {successMessage && (
                  <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-800 dark:text-green-200">
                    {successMessage}
                  </div>
                )}

                {/* Card type selector */}
                <div>
                  <label className="mb-2 block text-sm font-medium">{t("addCards.cardType")}</label>
                  <Select
                    value={cardType}
                    onValueChange={(value) => {
                      setCardType(value as CardTypeEnum);
                      // Clear property-specific fields when switching away from property type
                      if (value !== "property") {
                        setTheoremName("");
                        setExplanation("");
                      }
                      // Clear philosophy concept fields when switching away
                      if (value !== "philosophy_concept") {
                        setConceptAuthor("");
                        setConceptWork("");
                        setConceptDate("");
                        setConceptExplanation("");
                        setConceptExample("");
                      }
                    }}
                  >
                    <SelectTrigger className="h-11 w-full rounded-lg border border-border bg-background px-4 shadow-sm flex items-center justify-between text-sm text-foreground hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      <SelectValue className="leading-none text-sm" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCardTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          <div>
                            <div className="font-medium">
                              {type.labelKey ? t(type.labelKey) : type.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {type.descKey ? t(type.descKey) : type.description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fields adapt based on card type */}
                {isPhilosophyConceptType ? (
                  <>
                    {/* Concept field (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.concept")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptPlaceholder")}
                    />

                    {/* Author field */}
                    <RichCardInput
                      label={t("addCards.conceptAuthor")}
                      value={conceptAuthor}
                      onChange={setConceptAuthor}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptAuthorPlaceholder")}
                    />

                    {/* Work field */}
                    <RichCardInput
                      label={t("addCards.conceptWork")}
                      value={conceptWork}
                      onChange={setConceptWork}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptWorkPlaceholder")}
                    />

                    {/* Date field */}
                    <RichCardInput
                      label={t("addCards.conceptDate")}
                      value={conceptDate}
                      onChange={setConceptDate}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptDatePlaceholder")}
                    />

                    {/* Explanation field */}
                    <RichCardInput
                      label={t("addCards.conceptExplanation")}
                      value={conceptExplanation}
                      onChange={setConceptExplanation}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptExplanationPlaceholder")}
                    />

                    {/* Example field */}
                    <RichCardInput
                      label={t("addCards.conceptExample")}
                      value={conceptExample}
                      onChange={setConceptExample}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.conceptExamplePlaceholder")}
                    />
                  </>
                ) : isPropertyType ? (
                  <>
                    {/* Theorem name field (required) */}
                    <RichCardInput
                      label={t("addCards.theoremName")}
                      value={theoremName}
                      onChange={setTheoremName}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.theoremNamePlaceholder")}
                    />

                    {/* Hypotheses field (required) */}
                    <RichCardInput
                      label={t("addCards.hypotheses")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.hypothesesPlaceholder")}
                    />

                    {/* Statement/Result field (required) */}
                    <RichCardInput
                      label={t("addCards.statement")}
                      value={back}
                      onChange={setBack}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.statementPlaceholder")}
                    />

                    {/* Explanation/Proof field (optional) */}
                    <RichCardInput
                      label={t("addCards.explanation")}
                      value={explanation}
                      onChange={setExplanation}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.explanationPlaceholder")}
                    />
                  </>
                ) : (
                  <>
                    {/* Standard Front field */}
                    <RichCardInput
                      label={t("addCards.front")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.frontPlaceholder")}
                    />

                    {/* Standard Back field */}
                    <RichCardInput
                      label={t("addCards.back")}
                      value={back}
                      onChange={setBack}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.backPlaceholder")}
                    />
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    {t("addCards.shortcutHint").split("Cmd+")[0]}<kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">Cmd+Enter</kbd>{t("addCards.shortcutHint").includes("Cmd+Enter") ? "" : t("addCards.shortcutHint").split("Cmd+Enter")[1]}
                  </p>
                  <Button
                    onClick={handleCreateCard}
                    disabled={(!isPhilosophyConceptType && (!front.trim() || !back.trim())) || (isPhilosophyConceptType && !front.trim()) || (isPropertyType && !theoremName.trim()) || creating}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {creating ? t("addCards.adding") : t("addCards.addCard")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick tips */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <h3 className="font-medium mb-2">{t("addCards.tipsTitle")}</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>{t("addCards.tip1")}</li>
                  <li>{t("addCards.tip2")}</li>
                  <li>{t("addCards.tip3")}</li>
                  <li>{t("addCards.tip4")}</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI card generation */}
        {creationMode === "ai" && (
          <AICardGenerator deckId={deckId} />
        )}
      </div>

      {/* Import dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialDeckId={deckId}
        onSuccess={handleImportSuccess}
      />

      {/* Vocabulary import dialog for languages mode */}
      {deck && deckMode === "languages" && (
        <VocabularyImportDialog
          open={vocabImportDialogOpen}
          onOpenChange={setVocabImportDialogOpen}
          deck={deck}
          onSuccess={handleVocabImportSuccess}
        />
      )}
    </>
  );
}
