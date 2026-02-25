"use client";

import { useState, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2 } from "lucide-react";
import { listDecks, type Deck } from "@/store/decks";
import { createImport, generateCards, persistGeneratedCards, type GenerateCardsResult, type CardProposal } from "@/store/imports";
import { GeneratedCardRow } from "@/components/GeneratedCardRow";
import { useUserPlan } from "@/hooks/useUserPlan";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_URL } from "@/lib/backend";

// Import dynamique pour éviter les erreurs SSR
let pdfjsLib: any = null;

if (typeof window !== "undefined") {
  import("pdfjs-dist").then(async (pdfjs) => {
    pdfjsLib = pdfjs;
    // Set worker source to local file
    // The postinstall script copies either .mjs or .js to public/
    // Try .mjs first (newer versions), fallback to .js
    const workerMjs = "/pdf.worker.min.mjs";
    const workerJs = "/pdf.worker.min.js";

    // Check which file exists and set workerSrc accordingly
    try {
      const response = await fetch(workerMjs, { method: "HEAD" });
      if (response.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMjs;
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerJs;
      }
    } catch {
      // Fallback to .js if .mjs check fails
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerJs;
    }
    // Keep disableWorker = true for safety, but workerSrc must be set to avoid runtime error
    pdfjsLib.disableWorker = true;
  });
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDeckId?: string | null;
  onSuccess?: () => void;
  ankiOnly?: boolean;
}

type Step = "file" | "extract" | "review-text" | "review-cards" | "importing-anki";

export function ImportDialog({
  open,
  onOpenChange,
  initialDeckId = null,
  onSuccess,
  ankiOnly = false,
}: ImportDialogProps) {
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(initialDeckId || null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [pageRange, setPageRange] = useState("1-5");
  const [generatedCards, setGeneratedCards] = useState<CardProposal[]>([]);
  const [selectedCardIndices, setSelectedCardIndices] = useState<Set<number>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [isImportingAnki, setIsImportingAnki] = useState(false);
  const [ankiImportResult, setAnkiImportResult] = useState<{ imported: number; decks: number } | null>(null);
  const [ankiProgress, setAnkiProgress] = useState<{ total: number; imported: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef<string | null>(null);
  const ankiImportIdRef = useRef<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const importCompleteRef = useRef(false);

  // Check user plan to disable AI generation
  const userPlan = useUserPlan();
  const canUseAI = userPlan?.canUseAI ?? false;

  const loadDecks = async () => {
    if (initialDeckId) return;
    const loaded = await listDecks();
    setDecks(loaded);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith(".apkg")) {
        setFile(null);
        setExtractionError("Please select an Anki (.apkg) file.");
        return;
      }
      setFile(selectedFile);
      setExtractionError(null);
    }
  };

  const extractTextFromPDF = async (file: File, pageRange: string): Promise<string> => {
    if (!pdfjsLib) {
      throw new Error("PDF.js not loaded");
    }

    const buffer = await file.arrayBuffer();
    const [start, end] = pageRange.split("-").map(Number);
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const totalPages = Math.min(end, pdf.numPages);
    let fullText = "";

    for (let i = start; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => it.str).join(" ");
      fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
      setExtractionProgress(((i - start + 1) / (totalPages - start + 1)) * 100);
    }

    return fullText.trim();
  };

  const completeAnkiImport = async (finalProgress?: { total?: number; imported?: number }) => {
    if (importCompleteRef.current) return;
    importCompleteRef.current = true;
    stopProgressPolling();
    if (finalProgress && (finalProgress.total !== undefined || finalProgress.imported !== undefined)) {
      setAnkiProgress({
        total: finalProgress.total ?? 0,
        imported: finalProgress.imported ?? 0,
      });
    }
    await onSuccess?.();
    handleClose(false);
  };

  // Poll for Anki import progress
  const startProgressPolling = (ankiImportId: string) => {
    const supabase = createClient();

    const poll = async () => {
      try {
        const { data } = await supabase
          .from("anki_imports")
          .select("total_cards, imported_cards, status, error_message")
          .eq("id", ankiImportId)
          .single();

        if (data) {
          setAnkiProgress({
            total: data.total_cards || 0,
            imported: data.imported_cards || 0,
          });

          // Stop polling when done or error
          if (data.status === "done" || data.status === "error") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            if (data.status === "done") {
              await completeAnkiImport({
                total: data.total_cards || 0,
                imported: data.imported_cards || 0,
              });
            } else if (data.status === "error") {
              setExtractionError(data.error_message || "Import failed");
              setStep("file");
              setIsImportingAnki(false);
            }
          }
        }
      } catch (e) {
        console.warn("[ANKI IMPORT] Progress polling error:", e);
      }
    };

    // Poll every 500ms
    pollingRef.current = setInterval(poll, 500);
    poll(); // Initial poll
  };

  const stopProgressPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleImportAnki = async () => {
    if (!file) return;

    importCompleteRef.current = false;
    setStep("importing-anki");
    setIsImportingAnki(true);
    setExtractionError(null);
    setAnkiProgress(null);

    try {
      // Get Supabase session for auth token
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No Supabase session. Please log in again.");
      }

      const formData = new FormData();
      formData.append("file", file);

      // Start fetch (non-blocking progress polling)
      const fetchPromise = fetch(`${BACKEND_URL}/anki/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      // Wait briefly then start polling (the backend creates the record quickly)
      setTimeout(async () => {
        // Query for the most recent pending/running import for this user
        const { data: recentImport } = await supabase
          .from("anki_imports")
          .select("id")
          .eq("filename", file.name)
          .in("status", ["pending", "running"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (recentImport?.id) {
          ankiImportIdRef.current = recentImport.id;
          startProgressPolling(recentImport.id);
        }
      }, 300);

      const response = await fetchPromise;

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[ANKI IMPORT] Server error:", response.status, errorData);
        throw new Error(errorData.details || errorData.error || "Import failed");
      }

      const result = await response.json();

      // If we got an ankiImportId from the response, use it for final progress
      if (result.ankiImportId && !ankiImportIdRef.current) {
        ankiImportIdRef.current = result.ankiImportId;
      }

      if (importCompleteRef.current) {
        return;
      }

      setAnkiImportResult({ imported: result.imported, decks: result.decks });
      setAnkiProgress({ total: result.imported, imported: result.imported });

      // Stop polling
      stopProgressPolling();

      await completeAnkiImport({ total: result.imported, imported: result.imported });
    } catch (error) {
      stopProgressPolling();
      setExtractionError(error instanceof Error ? error.message : "Import failed");
      setStep("file");
    } finally {
      setIsImportingAnki(false);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".apkg")) {
      setExtractionError("Please select an Anki (.apkg) file.");
      return;
    }

    // Check if this is an Anki file
    if (file.name.endsWith(".apkg")) {
      await handleImportAnki();
      return;
    }

    setStep("extract");
    setExtractionProgress(0);
    setExtractionError(null);

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Extraction timeout (20s)"));
      }, 20000);
    });

    try {
      const extractionPromise = (async () => {
        let text = "";
        let pageCount: number | undefined;

        if (file.type === "application/pdf") {
          text = await extractTextFromPDF(file, pageRange);
          const [start, end] = pageRange.split("-").map(Number);
          pageCount = end - start + 1;
        } else {
          throw new Error("Unsupported file type");
        }

        if (!text.trim()) {
          throw new Error("No text extracted from file");
        }

        setExtractedText(text);

        const importDoc = await createImport(
          selectedDeckId,
          file.name,
          "pdf",
          text,
          pageCount,
          undefined
        );

        importIdRef.current = importDoc.id;
        setStep("review-text");
      })();

      await Promise.race([extractionPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      setExtractionError(error instanceof Error ? error.message : "Extraction failed");
      setStep("file");
    }
  };

  const handleGenerateCards = async () => {
    if (!importIdRef.current || !selectedDeckId) return;

    setIsGenerating(true);
    setUsedFallback(false);
    try {
      let deckName: string | undefined;
      if (initialDeckId) {
        const allDecks = await listDecks();
        const deck = allDecks.find((d) => d.id === initialDeckId);
        deckName = deck?.name;
      } else {
        const deck = decks.find((d) => d.id === selectedDeckId);
        deckName = deck?.name;
      }
      const result: GenerateCardsResult = await generateCards(
        importIdRef.current,
        selectedDeckId,
        deckName,
        20
      );
      setGeneratedCards(result.cards);
      setUsedFallback(result.usedFallback);
      setSelectedCardIndices(new Set(result.cards.map((_: unknown, i: number) => i)));
      setStep("review-cards");
    } catch (error) {
      alert("Failed to generate cards: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleCard = (index: number) => {
    const newSet = new Set(selectedCardIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedCardIndices(newSet);
  };

  const handleUpdateCard = (index: number, front: string, back: string) => {
    const updated = [...generatedCards];
    updated[index] = { ...updated[index], front, back };
    setGeneratedCards(updated);
  };

  const handleDeleteCard = (index: number) => {
    const updated = generatedCards.filter((_, i) => i !== index);
    setGeneratedCards(updated);
    const newSet = new Set(selectedCardIndices);
    newSet.delete(index);
    const adjusted = new Set<number>();
    newSet.forEach((i) => {
      if (i < index) adjusted.add(i);
      else if (i > index) adjusted.add(i - 1);
    });
    setSelectedCardIndices(adjusted);
  };

  const handleAddSelected = async () => {
    if (!importIdRef.current || !selectedDeckId || selectedCardIndices.size === 0) return;

    setIsAdding(true);
    try {
      const selected = Array.from(selectedCardIndices)
        .map((i) => generatedCards[i])
        .filter(Boolean);
      await persistGeneratedCards(importIdRef.current, selectedDeckId, selected);
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (error) {
      alert("Failed to add cards: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsAdding(false);
    }
  };

  const reset = () => {
    stopProgressPolling();
    setStep("file");
    setFile(null);
    setExtractedText("");
    setExtractionProgress(0);
    setExtractionError(null);
    setGeneratedCards([]);
    setSelectedCardIndices(new Set());
    setUsedFallback(false);
    setIsImportingAnki(false);
    setAnkiImportResult(null);
    setAnkiProgress(null);
    importIdRef.current = null;
    ankiImportIdRef.current = null;
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
    }
    onOpenChange(open);
  };

  if (open && decks.length === 0 && !initialDeckId) {
    loadDecks();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "file" && "Import Document"}
            {step === "extract" && "Extracting Text..."}
            {step === "review-text" && "Review Extracted Text"}
            {step === "review-cards" && "Review Generated Cards"}
            {step === "importing-anki" && "Importing Anki Deck..."}
          </DialogTitle>
          <DialogDescription>
            {step === "file" && (ankiOnly ? "Upload an Anki (.apkg) file" : "Upload a PDF or Anki (.apkg) file")}
            {step === "extract" && "Please wait while we extract text from your document"}
            {step === "review-text" && "Review the extracted text, then generate cards"}
            {step === "review-cards" && "Select and edit cards to add to your deck"}
            {step === "importing-anki" && "Please wait while we import your Anki deck"}
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="file">File</Label>
              <div className="mt-2 flex items-center gap-4">
                <Input
                  id="file"
                  type="file"
                  accept={ankiOnly ? ".apkg,application/octet-stream" : ".pdf,.apkg"}
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="cursor-pointer"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {file.name}
                  </div>
                )}
              </div>
            </div>

            {file?.type === "application/pdf" && (
              <div>
                <Label htmlFor="pageRange">Page Range (e.g., 1-5)</Label>
                <Input
                  id="pageRange"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="1-5"
                  className="mt-2"
                />
              </div>
            )}

            {!initialDeckId && !file?.name.endsWith(".apkg") && (
              <div>
                <Label htmlFor="deck">Select Deck</Label>
                <select
                  id="deck"
                  value={selectedDeckId || ""}
                  onChange={(e) => setSelectedDeckId(e.target.value || null)}
                  className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a deck...</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {file?.name.endsWith(".apkg") && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
                Anki deck will be imported with its original hierarchy
              </div>
            )}

            {extractionError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {extractionError}
              </div>
            )}
          </div>
        )}

        {step === "extract" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Extracting text... {Math.round(extractionProgress)}%
            </p>
          </div>
        )}

        {step === "importing-anki" && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {ankiImportResult
                ? `Successfully imported ${ankiImportResult.imported} cards from ${ankiImportResult.decks} decks`
                : ankiProgress && ankiProgress.total > 0
                  ? `Importing cards... ${ankiProgress.imported} / ${ankiProgress.total}`
                  : "Importing Anki deck..."}
            </p>
            {ankiProgress && ankiProgress.total > 0 && !ankiImportResult && (
              <div className="mt-4 mx-auto max-w-xs">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, (ankiProgress.imported / ankiProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {Math.round((ankiProgress.imported / ankiProgress.total) * 100)}%
                </p>
              </div>
            )}
          </div>
        )}

        {step === "review-text" && (
          <div className="space-y-4 py-4">
            {!canUseAI && (
              <div className="rounded-lg border border-muted bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Fonctionnalité réservée aux abonnés. La génération de cartes via IA nécessite un abonnement Starter ou Pro.
              </div>
            )}
            <div>
              <Label>Extracted Text ({extractedText.length} characters)</Label>
              <Textarea
                value={extractedText}
                readOnly
                className="mt-2 min-h-[200px] font-mono text-sm"
              />
            </div>
            {extractedText.length > 20000 && (
              <p className="text-sm text-muted-foreground">
                ⚠️ Text will be truncated to 20,000 characters for generation
              </p>
            )}
          </div>
        )}

        {step === "review-cards" && (
          <div className="space-y-4 py-4">
            {usedFallback && (
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ LLM unavailable. Using local heuristic cards.
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedCardIndices.size} of {generatedCards.length} cards selected
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const all = new Set(generatedCards.map((_card, i) => i));
                  setSelectedCardIndices(all);
                }}
              >
                Select all
              </Button>
            </div>
            <div className="max-h-[400px] space-y-3 overflow-y-auto">
              {generatedCards.map((card, index) => (
                <GeneratedCardRow
                  key={index}
                  card={card}
                  index={index}
                  selected={selectedCardIndices.has(index)}
                  onToggle={handleToggleCard}
                  onUpdate={handleUpdateCard}
                  onDelete={handleDeleteCard}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "file" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExtract}
                disabled={
                  ankiOnly
                    ? !file
                    : !file || (!initialDeckId && !selectedDeckId && !file?.name.endsWith(".apkg"))
                }
              >
                <Upload className="mr-2 h-4 w-4" />
                {ankiOnly || file?.name.endsWith(".apkg") ? "Import Anki Deck" : "Extract Text"}
              </Button>
            </>
          )}
          {step === "review-text" && (
            <>
              <Button variant="outline" onClick={() => setStep("file")}>
                Back
              </Button>
              {!canUseAI ? (
                <Button disabled className="opacity-50 cursor-not-allowed">
                  Fonctionnalité réservée aux abonnés
                </Button>
              ) : (
                <Button onClick={handleGenerateCards} disabled={isGenerating || !selectedDeckId}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Cards"
                  )}
                </Button>
              )}
            </>
          )}
          {step === "review-cards" && (
            <>
              <Button variant="outline" onClick={() => setStep("review-text")}>
                Back
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={isAdding || selectedCardIndices.size === 0}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  `Add ${selectedCardIndices.size} Selected`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
