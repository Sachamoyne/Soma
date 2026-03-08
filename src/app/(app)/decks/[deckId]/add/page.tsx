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
import { isLawCardType, isMedicineCardType } from "@/lib/card-types";
import { DiagramEditor, type DiagramData } from "@/components/DiagramEditor";
import type { DeckMode } from "@/lib/supabase-db";
import { ImportDialog } from "@/components/ImportDialog";
import { VocabularyImportDialog } from "@/components/VocabularyImportDialog";
import { AICardGenerator } from "@/components/AICardGenerator";
import { useTranslation } from "@/i18n";
import { Camera } from "lucide-react";
import { useIsNative } from "@/hooks/useIsNative";

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
  // Law mode — statute_article fields
  const [lawArticleText, setLawArticleText] = useState("");
  const [lawConditions, setLawConditions] = useState("");
  const [lawPitfalls, setLawPitfalls] = useState("");
  const [lawExample, setLawExample] = useState("");
  // Law mode — case_brief fields
  const [lawFacts, setLawFacts] = useState("");
  const [lawProcedure, setLawProcedure] = useState("");
  const [lawProblem, setLawProblem] = useState("");
  const [lawSolution, setLawSolution] = useState("");
  const [lawScope, setLawScope] = useState("");
  // Law mode — practical_case fields
  const [lawQualification, setLawQualification] = useState("");
  const [lawRules, setLawRules] = useState("");
  const [lawApplication, setLawApplication] = useState("");
  const [lawConclusion, setLawConclusion] = useState("");
  // Medicine mode — med_definition fields
  const [medDefinition, setMedDefinition] = useState("");
  const [medKeyElements, setMedKeyElements] = useState("");
  const [medExample, setMedExample] = useState("");
  // Medicine mode — med_presentation fields
  const [medSymptoms, setMedSymptoms] = useState("");
  const [medSigns, setMedSigns] = useState("");
  const [medPresentationNotes, setMedPresentationNotes] = useState("");
  // Medicine mode — med_diagnosis fields
  const [medDiagnoses, setMedDiagnoses] = useState("");
  const [medDiagNotes, setMedDiagNotes] = useState("");
  // Medicine mode — med_treatment fields
  const [medFirstLine, setMedFirstLine] = useState("");
  const [medAlternatives, setMedAlternatives] = useState("");
  const [medLifestyle, setMedLifestyle] = useState("");
  // Medicine mode — med_clinical_case fields
  const [medCaseDiagnosis, setMedCaseDiagnosis] = useState("");
  const [medCaseExplanation, setMedCaseExplanation] = useState("");
  // Diagram card
  const [diagramData, setDiagramData] = useState<DiagramData | null>(null);
  const [cardType, setCardType] = useState<CardTypeEnum>("basic");
  const [creating, setCreating] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [vocabImportDialogOpen, setVocabImportDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isNative = useIsNative();

  // Check if current type is property (needs special form)
  const isPropertyType = cardType === "property";
  const isPhilosophyConceptType = cardType === "philosophy_concept";
  const isLawStatuteType = cardType === "statute_article";
  const isLawCaseBriefType = cardType === "case_brief";
  const isLawPracticalCaseType = cardType === "practical_case";
  const isMedDefinitionType = cardType === "med_definition";
  const isMedPresentationType = cardType === "med_presentation";
  const isMedDiagnosisType = cardType === "med_diagnosis";
  const isMedTreatmentType = cardType === "med_treatment";
  const isMedClinicalCaseType = cardType === "med_clinical_case";
  const isDiagramType = cardType === "diagram";

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
    // Validation: philosophy_concept, law and medicine cards require front only
    if (isPhilosophyConceptType || isLawStatuteType || isLawCaseBriefType || isLawPracticalCaseType ||
        isMedDefinitionType || isMedPresentationType || isMedDiagnosisType || isMedTreatmentType || isMedClinicalCaseType) {
      if (!front.trim()) return;
    } else if (isDiagramType) {
      if (!front.trim() || !diagramData?.image_url || !diagramData?.markers.length) return;
    } else if (!front.trim() || !back.trim()) {
      return;
    }

    setCreating(true);
    setSuccessMessage(null);

    try {
      const normalizedDeckId = String(deckId);

      // Build extra field for property cards
      let extra: Record<string, unknown> | null = null;
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

      // Build extra field for law card types
      if (isLawStatuteType) {
        extra = {};
        if (lawArticleText.trim()) extra.articleText = lawArticleText.trim();
        if (lawConditions.trim()) extra.conditions = lawConditions.trim();
        if (lawPitfalls.trim()) extra.pitfalls = lawPitfalls.trim();
        if (lawExample.trim()) extra.example = lawExample.trim();
      }
      if (isLawCaseBriefType) {
        extra = {};
        if (lawFacts.trim()) extra.facts = lawFacts.trim();
        if (lawProcedure.trim()) extra.procedure = lawProcedure.trim();
        if (lawProblem.trim()) extra.problem = lawProblem.trim();
        if (lawSolution.trim()) extra.solution = lawSolution.trim();
        if (lawScope.trim()) extra.scope = lawScope.trim();
      }
      if (isLawPracticalCaseType) {
        extra = {};
        if (lawQualification.trim()) extra.qualification = lawQualification.trim();
        if (lawRules.trim()) extra.rules = lawRules.trim();
        if (lawApplication.trim()) extra.application = lawApplication.trim();
        if (lawConclusion.trim()) extra.conclusion = lawConclusion.trim();
      }

      // Build extra field for medicine card types
      if (isMedDefinitionType) {
        extra = {};
        if (medDefinition.trim()) extra.definition = medDefinition.trim();
        if (medKeyElements.trim()) extra.keyElements = medKeyElements.trim();
        if (medExample.trim()) extra.example = medExample.trim();
      }
      if (isMedPresentationType) {
        extra = {};
        if (medSymptoms.trim()) extra.symptoms = medSymptoms.trim();
        if (medSigns.trim()) extra.signs = medSigns.trim();
        if (medPresentationNotes.trim()) extra.notes = medPresentationNotes.trim();
      }
      if (isMedDiagnosisType) {
        extra = {};
        if (medDiagnoses.trim()) extra.diagnoses = medDiagnoses.trim();
        if (medDiagNotes.trim()) extra.notes = medDiagNotes.trim();
      }
      if (isMedTreatmentType) {
        extra = {};
        if (medFirstLine.trim()) extra.firstLine = medFirstLine.trim();
        if (medAlternatives.trim()) extra.alternatives = medAlternatives.trim();
        if (medLifestyle.trim()) extra.lifestyle = medLifestyle.trim();
      }
      if (isMedClinicalCaseType) {
        extra = {};
        if (medCaseDiagnosis.trim()) extra.diagnosis = medCaseDiagnosis.trim();
        if (medCaseExplanation.trim()) extra.explanation = medCaseExplanation.trim();
      }

      // Build extra field for diagram card
      if (isDiagramType && diagramData) {
        extra = {
          image_url: diagramData.image_url,
          markers: diagramData.markers,
        };
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
      // For law cards, build a compact summary back
      if (isLawStatuteType) {
        cardBack = lawArticleText.trim()
          ? lawArticleText.trim().substring(0, 120)
          : front.trim();
      }
      if (isLawCaseBriefType) {
        const parts: string[] = [];
        if (lawProblem.trim()) parts.push(lawProblem.trim());
        if (lawSolution.trim()) parts.push(`→ ${lawSolution.trim()}`);
        cardBack = parts.join(" ") || front.trim();
      }
      if (isLawPracticalCaseType) {
        cardBack = lawConclusion.trim() || front.trim();
      }
      // For medicine cards, build a compact summary back
      if (isMedDefinitionType) {
        cardBack = medDefinition.trim()
          ? medDefinition.trim().substring(0, 120)
          : front.trim();
      }
      if (isMedPresentationType) {
        cardBack = medSymptoms.trim()
          ? medSymptoms.trim().substring(0, 120)
          : front.trim();
      }
      if (isMedDiagnosisType) {
        cardBack = medDiagnoses.trim()
          ? medDiagnoses.trim().substring(0, 120)
          : front.trim();
      }
      if (isMedTreatmentType) {
        cardBack = medFirstLine.trim() || front.trim();
      }
      if (isMedClinicalCaseType) {
        cardBack = medCaseDiagnosis.trim() || front.trim();
      }
      if (isDiagramType) {
        cardBack = front.trim();
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
      setLawArticleText(""); setLawConditions(""); setLawPitfalls(""); setLawExample("");
      setLawFacts(""); setLawProcedure(""); setLawProblem(""); setLawSolution(""); setLawScope("");
      setLawQualification(""); setLawRules(""); setLawApplication(""); setLawConclusion("");
      setMedDefinition(""); setMedKeyElements(""); setMedExample("");
      setMedSymptoms(""); setMedSigns(""); setMedPresentationNotes("");
      setMedDiagnoses(""); setMedDiagNotes("");
      setMedFirstLine(""); setMedAlternatives(""); setMedLifestyle("");
      setMedCaseDiagnosis(""); setMedCaseExplanation("");
      setDiagramData(null);

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
      <div className="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto space-y-6">
        {/* Header with title and mode toggle */}
        <div className="space-y-4">
          <div className="flex items-start justify-between min-h-[56px]">
            <div>
              <h2 className="text-2xl font-semibold">{t("addCards.title")}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("addCards.subtitle")}
              </p>
            </div>
            {/* Import buttons — only visible in AI mode; reserved space prevents header reflow */}
            <div className="flex gap-2 shrink-0">
              {/* Vocabulary import — hidden on iOS native (image/* triggers Take Photo crash) */}
              {!isNative && creationMode === "ai" && deckMode === "languages" && deck && (
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
                      // Clear law fields when switching away
                      if (!["statute_article", "case_brief", "practical_case"].includes(value)) {
                        setLawArticleText(""); setLawConditions(""); setLawPitfalls(""); setLawExample("");
                        setLawFacts(""); setLawProcedure(""); setLawProblem(""); setLawSolution(""); setLawScope("");
                        setLawQualification(""); setLawRules(""); setLawApplication(""); setLawConclusion("");
                      }
                      // Clear diagram when switching away
                      if (value !== "diagram") {
                        setDiagramData(null);
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
                {isLawStatuteType ? (
                  <>
                    {/* Article reference (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.lawArticleRef")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawArticleRefPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawArticleText")}
                      value={lawArticleText}
                      onChange={setLawArticleText}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawArticleTextPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawConditions")}
                      value={lawConditions}
                      onChange={setLawConditions}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawConditionsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawPitfalls")}
                      value={lawPitfalls}
                      onChange={setLawPitfalls}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawPitfallsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawExample")}
                      value={lawExample}
                      onChange={setLawExample}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawExamplePlaceholder")}
                    />
                  </>
                ) : isLawCaseBriefType ? (
                  <>
                    {/* Case identifier (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.lawCaseId")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawCaseIdPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawFacts")}
                      value={lawFacts}
                      onChange={setLawFacts}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawFactsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawProcedure")}
                      value={lawProcedure}
                      onChange={setLawProcedure}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawProcedurePlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawProblem")}
                      value={lawProblem}
                      onChange={setLawProblem}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawProblemPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawSolution")}
                      value={lawSolution}
                      onChange={setLawSolution}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawSolutionPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawScope")}
                      value={lawScope}
                      onChange={setLawScope}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawScopePlaceholder")}
                    />
                  </>
                ) : isLawPracticalCaseType ? (
                  <>
                    {/* Practical question (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.lawQuestion")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawQuestionPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawQualification")}
                      value={lawQualification}
                      onChange={setLawQualification}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawQualificationPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawRules")}
                      value={lawRules}
                      onChange={setLawRules}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawRulesPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawApplication")}
                      value={lawApplication}
                      onChange={setLawApplication}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawApplicationPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.lawConclusion")}
                      value={lawConclusion}
                      onChange={setLawConclusion}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.lawConclusionPlaceholder")}
                    />
                  </>
                ) : isMedDefinitionType ? (
                  <>
                    {/* Term (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.medTerm")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medTermPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medDefinition")}
                      value={medDefinition}
                      onChange={setMedDefinition}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDefinitionPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medKeyElements")}
                      value={medKeyElements}
                      onChange={setMedKeyElements}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medKeyElementsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medExample")}
                      value={medExample}
                      onChange={setMedExample}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medExamplePlaceholder")}
                    />
                  </>
                ) : isMedPresentationType ? (
                  <>
                    {/* Disease name (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.medDisease")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDiseasePlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medSymptoms")}
                      value={medSymptoms}
                      onChange={setMedSymptoms}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medSymptomsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("medicineCard.signs")}
                      value={medSigns}
                      onChange={setMedSigns}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medSymptomsPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medDiagNotes")}
                      value={medPresentationNotes}
                      onChange={setMedPresentationNotes}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDiagNotesPlaceholder")}
                    />
                  </>
                ) : isMedDiagnosisType ? (
                  <>
                    {/* Clinical presentation (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.medPresentation")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medPresentationPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medDiagnoses")}
                      value={medDiagnoses}
                      onChange={setMedDiagnoses}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDiagnosesPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medDiagNotes")}
                      value={medDiagNotes}
                      onChange={setMedDiagNotes}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDiagNotesPlaceholder")}
                    />
                  </>
                ) : isMedTreatmentType ? (
                  <>
                    {/* Disease name (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.medDisease")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medDiseasePlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medFirstLine")}
                      value={medFirstLine}
                      onChange={setMedFirstLine}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medFirstLinePlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medAlternatives")}
                      value={medAlternatives}
                      onChange={setMedAlternatives}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medAlternativesPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medLifestyle")}
                      value={medLifestyle}
                      onChange={setMedLifestyle}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medLifestylePlaceholder")}
                    />
                  </>
                ) : isMedClinicalCaseType ? (
                  <>
                    {/* Clinical scenario (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.medClinicalScenario")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medClinicalScenarioPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medCaseDiagnosis")}
                      value={medCaseDiagnosis}
                      onChange={setMedCaseDiagnosis}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medCaseDiagnosisPlaceholder")}
                    />
                    <RichCardInput
                      label={t("addCards.medCaseExplanation")}
                      value={medCaseExplanation}
                      onChange={setMedCaseExplanation}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.medCaseExplanationPlaceholder")}
                    />
                  </>
                ) : isDiagramType ? (
                  <>
                    {/* Diagram title (required) — maps to FRONT */}
                    <RichCardInput
                      label={t("addCards.diagramTitle")}
                      value={front}
                      onChange={setFront}
                      onKeyDown={handleKeyDown}
                      placeholder={t("addCards.diagramTitlePlaceholder")}
                    />
                    {/* Diagram editor — upload + interactive marker placement */}
                    <DiagramEditor
                      value={diagramData}
                      onChange={setDiagramData}
                    />
                  </>
                ) : isPhilosophyConceptType ? (
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
                    disabled={
                      (isPhilosophyConceptType && !front.trim()) ||
                      (isPropertyType && !theoremName.trim()) ||
                      ((isLawStatuteType || isLawCaseBriefType || isLawPracticalCaseType) && !front.trim()) ||
                      ((isMedDefinitionType || isMedPresentationType || isMedDiagnosisType || isMedTreatmentType || isMedClinicalCaseType) && !front.trim()) ||
                      (isDiagramType && (!front.trim() || !diagramData?.image_url || !diagramData?.markers.length)) ||
                      (!isPhilosophyConceptType && !isPropertyType && !isLawStatuteType && !isLawCaseBriefType && !isLawPracticalCaseType && !isMedDefinitionType && !isMedPresentationType && !isMedDiagnosisType && !isMedTreatmentType && !isMedClinicalCaseType && !isDiagramType && (!front.trim() || !back.trim())) ||
                      creating
                    }
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
          <AICardGenerator deckId={deckId} deckMode={deckMode} />
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
