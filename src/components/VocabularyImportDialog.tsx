"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { type Deck, type VocabDirection, type LanguagesConfig } from "@/store/decks";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_URL } from "@/lib/backend";
import { useTranslation } from "@/i18n";

// Dynamic imports for SSR compatibility
let Tesseract: any = null;

if (typeof window !== "undefined") {
  import("tesseract.js").then((tesseract) => {
    Tesseract = tesseract;
  });
}

/** Vocabulary entry structure */
export interface VocabularyEntry {
  wordSource: string;
  wordTarget: string;
  gender?: string;
  plural?: string;
  note?: string;
  example?: string;
}

interface VocabularyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: Deck;
  onSuccess?: () => void;
}

type Step = "upload" | "extracting" | "parsing" | "review" | "generating";

export function VocabularyImportDialog({
  open,
  onOpenChange,
  deck,
  onSuccess,
}: VocabularyImportDialogProps) {
  const { t } = useTranslation();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  // Get languages config from deck
  const config = deck.config as LanguagesConfig | null;
  const sourceLanguage = config?.sourceLanguage || "Source";
  const targetLanguage = config?.targetLanguage || "Target";
  const vocabDirection = config?.vocabDirection || "normal";

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setExtractionProgress(0);
    setError(null);
    setEntries([]);
    setIsGenerating(false);
    setGeneratedCount(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const extractTextFromImage = async (file: File): Promise<string> => {
    if (!Tesseract) {
      throw new Error("Tesseract.js not loaded");
    }

    const { data } = await Tesseract.recognize(file, "fra+eng+deu+spa+ita+por+lat", {
      logger: (m: any) => {
        if (m.status === "recognizing text") {
          setExtractionProgress(m.progress * 100);
        }
      },
    });

    return data.text;
  };

  const parseVocabulary = async (text: string): Promise<VocabularyEntry[]> => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${BACKEND_URL}/languages/parse-vocabulary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to parse vocabulary");
    }

    const result = await response.json();
    return result.entries || [];
  };

  const handleExtractAndParse = async () => {
    if (!file) return;

    setError(null);
    setStep("extracting");
    setExtractionProgress(0);

    try {
      // Step 1: OCR
      const text = await extractTextFromImage(file);

      if (!text.trim()) {
        throw new Error(t("vocabularyImport.ocrFailed"));
      }

      // Step 2: AI Parsing
      setStep("parsing");
      const parsedEntries = await parseVocabulary(text);

      if (parsedEntries.length === 0) {
        setError(t("vocabularyImport.noEntriesFound"));
        setStep("review"); // Show empty review so user can add manually
      } else {
        setEntries(parsedEntries);
        setStep("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("upload");
    }
  };

  const handleUpdateEntry = (index: number, field: keyof VocabularyEntry, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleAddEntry = () => {
    setEntries([...entries, { wordSource: "", wordTarget: "" }]);
  };

  const buildCardBack = (entry: VocabularyEntry, isReversed: boolean): string => {
    // For reversed cards, the "back" is the source word
    const mainWord = isReversed ? entry.wordSource : entry.wordTarget;
    const parts: string[] = [mainWord];

    // Add optional info (only for non-reversed, as they relate to the target word)
    if (!isReversed) {
      if (entry.gender) {
        parts.push(`<span class="text-muted-foreground text-sm">(${entry.gender})</span>`);
      }
      if (entry.plural) {
        parts.push(`<span class="text-muted-foreground text-sm">pl: ${entry.plural}</span>`);
      }
      if (entry.note) {
        parts.push(`<div class="text-sm text-muted-foreground mt-2">${entry.note}</div>`);
      }
      if (entry.example) {
        parts.push(`<div class="text-sm italic mt-2">${entry.example}</div>`);
      }
    }

    return parts.join(" ");
  };

  const buildAllCards = (validEntries: VocabularyEntry[]) => {
    const allCards: { front: string; back: string; type: string; extra: Record<string, unknown> }[] = [];

    for (const entry of validEntries) {
      const extra: Record<string, unknown> = {
        wordSource: entry.wordSource,
        wordTarget: entry.wordTarget,
      };
      if (entry.gender) extra.gender = entry.gender;
      if (entry.plural) extra.plural = entry.plural;
      if (entry.note) extra.note = entry.note;
      if (entry.example) extra.example = entry.example;

      if (vocabDirection === "normal" || vocabDirection === "both") {
        allCards.push({
          front: entry.wordSource,
          back: buildCardBack(entry, false),
          type: "vocabulary",
          extra,
        });
      }

      if (vocabDirection === "reversed" || vocabDirection === "both") {
        allCards.push({
          front: entry.wordTarget,
          back: buildCardBack(entry, true),
          type: "vocabulary",
          extra: { ...extra, reversed: true },
        });
      }
    }

    return allCards;
  };

  const handleGenerateCards = async () => {
    const validEntries = entries.filter(
      (e) => e.wordSource.trim() && e.wordTarget.trim()
    );

    if (validEntries.length === 0) {
      setError(t("vocabularyImport.noEntriesFound"));
      return;
    }

    setIsGenerating(true);
    setStep("generating");
    setGeneratedCount(0);

    try {
      const allCards = buildAllCards(validEntries);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No Supabase session. Please log in again.");
      }

      // Use the same backend endpoint as "Generate with AI" so that
      // ai_cards_used_current_month is properly incremented.
      const response = await fetch(`${BACKEND_URL}/generate/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          deck_id: String(deck.id),
          cards: allCards,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "QUOTA_FREE_PLAN" || data.error === "QUOTA_EXCEEDED") {
          throw new Error(data.message || "AI card quota exceeded");
        }
        throw new Error(data.error || data.message || "Failed to save cards");
      }

      setGeneratedCount(allCards.length);

      // Success!
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate cards");
      setStep("review");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSkipAndGenerate = async () => {
    // Skip validation, generate directly
    await handleGenerateCards();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && t("vocabularyImport.title")}
            {step === "extracting" && t("vocabularyImport.extracting")}
            {step === "parsing" && t("vocabularyImport.parsing")}
            {step === "review" && t("vocabularyImport.reviewTitle")}
            {step === "generating" && t("vocabularyImport.generating")}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && t("vocabularyImport.description")}
            {step === "review" && t("vocabularyImport.reviewDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Upload Step */}
        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="vocab-file">{t("vocabularyImport.uploadPhoto")}</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {t("vocabularyImport.uploadHint")}
              </p>
              <div className="mt-2 flex items-center gap-4">
                <Input
                  id="vocab-file"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="cursor-pointer"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ImageIcon className="h-4 w-4" />
                    {file.name}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium mb-1">{sourceLanguage} → {targetLanguage}</p>
              <p className="text-muted-foreground">
                {vocabDirection === "normal" && t("decks.vocabDirectionNormal")}
                {vocabDirection === "reversed" && t("decks.vocabDirectionReversed")}
                {vocabDirection === "both" && t("decks.vocabDirectionBoth")}
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Extracting Step */}
        {step === "extracting" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("vocabularyImport.extracting")} {Math.round(extractionProgress)}%
            </p>
          </div>
        )}

        {/* Parsing Step */}
        {step === "parsing" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("vocabularyImport.parsing")}
            </p>
          </div>
        )}

        {/* Review Step */}
        {step === "review" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("vocabularyImport.entriesFound", { count: entries.length })}
              </p>
              <Button variant="outline" size="sm" onClick={handleAddEntry}>
                <Plus className="h-4 w-4 mr-1" />
                {t("vocabularyImport.addEntry")}
              </Button>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="max-h-[400px] space-y-3 overflow-y-auto">
              {entries.map((entry, index) => (
                <div
                  key={index}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">{sourceLanguage}</Label>
                      <Input
                        value={entry.wordSource}
                        onChange={(e) => handleUpdateEntry(index, "wordSource", e.target.value)}
                        placeholder={t("vocabularyImport.wordSource")}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">{targetLanguage}</Label>
                      <Input
                        value={entry.wordTarget}
                        onChange={(e) => handleUpdateEntry(index, "wordTarget", e.target.value)}
                        placeholder={t("vocabularyImport.wordTarget")}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveEntry(index)}
                      className="self-end text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Optional fields - collapsible */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("vocabularyImport.gender")}</Label>
                      <Input
                        value={entry.gender || ""}
                        onChange={(e) => handleUpdateEntry(index, "gender", e.target.value)}
                        placeholder="m/f/n"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("vocabularyImport.plural")}</Label>
                      <Input
                        value={entry.plural || ""}
                        onChange={(e) => handleUpdateEntry(index, "plural", e.target.value)}
                        placeholder="Plural form"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("vocabularyImport.note")}</Label>
                    <Input
                      value={entry.note || ""}
                      onChange={(e) => handleUpdateEntry(index, "note", e.target.value)}
                      placeholder="Optional note"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                </div>
              ))}

              {entries.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {t("vocabularyImport.noEntriesFound")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generating Step */}
        {step === "generating" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("vocabularyImport.generating")} {generatedCount} / {
                entries.filter(e => e.wordSource.trim() && e.wordTarget.trim()).length *
                (vocabDirection === "both" ? 2 : 1)
              }
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleExtractAndParse} disabled={!file}>
                <Upload className="mr-2 h-4 w-4" />
                {t("vocabularyImport.extracting").replace("...", "")}
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                {t("common.back")}
              </Button>
              <Button
                variant="outline"
                onClick={handleSkipAndGenerate}
                disabled={entries.length === 0 || isGenerating}
              >
                {t("vocabularyImport.skipAndGenerate")}
              </Button>
              <Button
                onClick={handleGenerateCards}
                disabled={entries.length === 0 || isGenerating}
              >
                {t("vocabularyImport.generateCards")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
