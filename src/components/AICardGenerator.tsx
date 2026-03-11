"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  FileText,
  Camera,
  Check,
  X,
  CheckCheck,
  XCircle,
  RefreshCw,
  Trash,
} from "lucide-react";
import { invalidateCardCaches } from "@/store/decks";
import { PaywallModal } from "@/components/PaywallModal";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { useUserPlan } from "@/hooks/useUserPlan";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_URL } from "@/lib/backend";
import type { DeckMode } from "@/lib/supabase-db";
import { useTranslation } from "@/i18n";
import { Capacitor } from "@capacitor/core";

interface CardPreview {
  front: string;
  back: string;
  tags?: string[];
  difficulty?: number;
}

interface AICardGeneratorProps {
  deckId: string;
  /** Optional deck mode — forwarded to the backend so it can use mode-specific prompts */
  deckMode?: DeckMode;
  onCardsConfirmed?: (importedCount: number) => void;
  className?: string;
}

export function AICardGenerator({
  deckId,
  deckMode,
  onCardsConfirmed,
  className,
}: AICardGeneratorProps) {
  const router = useRouter();

  // AI card generation state
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // User-controllable generation options
  const [cardsCount, setCardsCount] = useState<number | undefined>(undefined);
  const [detailLevel, setDetailLevel] = useState<
    "summary" | "standard" | "detailed"
  >("standard");

  // Preview state (cards not yet confirmed)
  const [generatedCards, setGeneratedCards] = useState<CardPreview[] | null>(
    null
  );
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set()
  );
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);

  // Source text for regeneration
  const [sourceText, setSourceText] = useState<string>("");
  const [sourcePdf, setSourcePdf] = useState<File | null>(null);

  // Regeneration loading states
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(
    null
  );

  // Paywall state
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<
    "free_plan" | "quota_exceeded"
  >("free_plan");
  const [paywallPlan, setPaywallPlan] = useState<
    "starter" | "pro" | undefined
  >(undefined);

  const { t } = useTranslation();

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
    setSourceText("");
    setSourcePdf(null);
    setRegeneratingAll(false);
    setRegeneratingIndex(null);
  };

  // Toggle card selection
  const toggleCard = (index: number) => {
    setSelectedIndices((prev) => {
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

  // Delete a single card from the preview list
  const deleteCard = (index: number) => {
    if (!generatedCards) return;

    const newCards = generatedCards.filter((_, i) => i !== index);
    setGeneratedCards(newCards.length > 0 ? newCards : null);

    // Update selected indices (shift indices after deleted card)
    const newSelected = new Set<number>();
    selectedIndices.forEach((i) => {
      if (i < index) {
        newSelected.add(i);
      } else if (i > index) {
        newSelected.add(i - 1);
      }
    });
    setSelectedIndices(newSelected);
  };

  // Regenerate all cards
  const handleRegenerateAll = async () => {
    if (!sourceText && !sourcePdf) {
      setAiError(t("aiGenerator.errorCannotRegenerate"));
      return;
    }

    setRegeneratingAll(true);
    setAiError(null);
    setPdfError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAiError("No Supabase session. Please log in again.");
        return;
      }

      let response: Response;

      if (sourcePdf) {
        const formData = new FormData();
        formData.append("file", sourcePdf);
        formData.append("deck_id", String(deckId));
        formData.append("language", "fr");

        if (cardsCount !== undefined) {
          formData.append("cardsCount", String(cardsCount));
        }
        if (detailLevel !== "standard") {
          formData.append("detailLevel", detailLevel);
        }

        response = await fetch(`${BACKEND_URL}/pdf/generate-cards`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });
      } else {
        const payload: {
          deck_id: string;
          language: string;
          text: string;
          cardsCount?: number;
          detailLevel?: "summary" | "standard" | "detailed";
          mode?: DeckMode;
        } = {
          deck_id: String(deckId),
          language: "fr",
          text: sourceText,
        };

        if (cardsCount !== undefined) {
          payload.cardsCount = cardsCount;
        }
        if (detailLevel !== "standard") {
          payload.detailLevel = detailLevel;
        }
        if (deckMode) {
          payload.mode = deckMode;
        }

        response = await fetch(`${BACKEND_URL}/generate/cards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        if (
          data.error === "QUOTA_FREE_PLAN" ||
          data.error === "QUOTA_EXCEEDED"
        ) {
          setPaywallReason(
            data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded"
          );
          setPaywallPlan(
            data.plan === "starter"
              ? "starter"
              : data.plan === "pro"
                ? "pro"
                : undefined
          );
          setPaywallOpen(true);
          return;
        }
        setAiError(
          data.message || data.error || t("aiGenerator.errorRegeneration")
        );
        return;
      }

      // Success - update preview
      setGeneratedCards(data.cards);
      setSelectedIndices(
        new Set(data.cards.map((_: unknown, i: number) => i))
      );
    } catch (error) {
      console.error("Error regenerating cards:", error);
      setAiError(
        error instanceof Error
          ? error.message
          : t("aiGenerator.errorRegeneration")
      );
    } finally {
      setRegeneratingAll(false);
    }
  };

  // Regenerate a single card
  const handleRegenerateCard = async (index: number) => {
    if (!sourceText && !sourcePdf) {
      setAiError(t("aiGenerator.errorCannotRegenerate"));
      return;
    }

    if (!generatedCards) return;

    setRegeneratingIndex(index);
    setAiError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAiError("No Supabase session. Please log in again.");
        return;
      }

      let response: Response;

      if (sourcePdf) {
        const formData = new FormData();
        formData.append("file", sourcePdf);
        formData.append("deck_id", String(deckId));
        formData.append("language", "fr");
        formData.append("cardsCount", "3");
        if (detailLevel !== "standard") {
          formData.append("detailLevel", detailLevel);
        }

        response = await fetch(`${BACKEND_URL}/pdf/generate-cards`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });
      } else {
        const payload = {
          deck_id: String(deckId),
          language: "fr",
          text: sourceText,
          cardsCount: 3,
          ...(detailLevel !== "standard" && { detailLevel }),
          ...(deckMode && { mode: deckMode }),
        };

        response = await fetch(`${BACKEND_URL}/generate/cards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        if (
          data.error === "QUOTA_FREE_PLAN" ||
          data.error === "QUOTA_EXCEEDED"
        ) {
          setPaywallReason(
            data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded"
          );
          setPaywallPlan(
            data.plan === "starter"
              ? "starter"
              : data.plan === "pro"
                ? "pro"
                : undefined
          );
          setPaywallOpen(true);
          return;
        }
        setAiError(
          data.message || data.error || t("aiGenerator.errorRegeneration")
        );
        return;
      }

      // Replace the card at the given index with the first generated card
      if (data.cards && data.cards.length > 0) {
        const newCards = [...generatedCards];
        newCards[index] = data.cards[0];
        setGeneratedCards(newCards);

        if (!selectedIndices.has(index)) {
          setSelectedIndices(new Set([...selectedIndices, index]));
        }
      }
    } catch (error) {
      console.error("Error regenerating card:", error);
      setAiError(
        error instanceof Error
          ? error.message
          : t("aiGenerator.errorRegeneration")
      );
    } finally {
      setRegeneratingIndex(null);
    }
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
      console.log(
        "[handleConfirmCards] Early return - no cards or no selection"
      );
      return;
    }

    setConfirmLoading(true);
    setAiError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAiError("No Supabase session. Please log in again.");
        setConfirmLoading(false);
        return;
      }

      const selectedCards = generatedCards.filter((_, index) =>
        selectedIndices.has(index)
      );

      console.log("[handleConfirmCards] Sending request", {
        deck_id: String(deckId),
        selectedCardsCount: selectedCards.length,
        selectedCards: selectedCards.map((c) => ({
          front: c.front.substring(0, 50),
        })),
      });

      const response = await fetch(`${BACKEND_URL}/generate/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
        console.log(
          "[handleConfirmCards] Response NOT OK, handling error"
        );
        if (
          data.error === "QUOTA_FREE_PLAN" ||
          data.error === "QUOTA_EXCEEDED"
        ) {
          setPaywallReason(
            data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded"
          );
          setPaywallPlan(
            data.plan === "starter"
              ? "starter"
              : data.plan === "pro"
                ? "pro"
                : undefined
          );
          setPaywallOpen(true);
          return;
        }
        setAiError(
          data.message || data.error || t("aiGenerator.errorConfirmation")
        );
        return;
      }

      // Success!
      console.log(
        "[handleConfirmCards] SUCCESS - imported:",
        data.imported
      );
      setConfirmedCount(data.imported);
      setGeneratedCards(null);
      setSelectedIndices(new Set());

      // Force immediate refresh of deck counts
      invalidateCardCaches();

      // Small delay to ensure DB has processed the inserts before refetching
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger event for other components (e.g., deck list)
      window.dispatchEvent(new Event("soma-counts-updated"));

      // Force Next.js App Router refresh
      router.refresh();

      // Let the consumer run page-specific logic (e.g., Overview retry-polling)
      onCardsConfirmed?.(data.imported);
    } catch (error) {
      console.error("[handleConfirmCards] CATCH error:", error);
      setAiError(
        error instanceof Error
          ? error.message
          : t("aiGenerator.errorConfirmation")
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isImage =
      file.type.startsWith("image/") ||
      /\.(jpg|jpeg|png|heic|gif|webp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      setPdfError(t("aiGenerator.errorInvalidFileType"));
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setPdfError(
        t("aiGenerator.errorPdfTooLarge", { size: String(Math.round(MAX_SIZE / 1024 / 1024)) })
      );
      return;
    }

    setPdfLoading(true);
    resetPreview();

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setPdfError("No Supabase session. Please log in again.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("deck_id", String(deckId));
      formData.append("language", "fr");

      if (cardsCount !== undefined) {
        formData.append("cardsCount", String(cardsCount));
      }
      if (detailLevel !== "standard") {
        formData.append("detailLevel", detailLevel);
      }

      const response = await fetch(`${BACKEND_URL}/pdf/generate-cards`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: "include",
        body: formData,
      });

      const responseText = await response.text();
      const contentType = response.headers.get("content-type");

      let data: any;
      try {
        if (!contentType || !contentType.includes("application/json")) {
          console.error("[handlePdfUpload] Non-JSON response:", {
            status: response.status,
            contentType,
            text: responseText.substring(0, 200),
          });
          setPdfError(t("aiGenerator.errorInvalidResponse"));
          return;
        }

        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error(
          "[handlePdfUpload] Failed to parse JSON response:",
          jsonError,
          "Response text:",
          responseText.substring(0, 200)
        );
        setPdfError(t("aiGenerator.errorParseResponse"));
        return;
      }

      if (!response.ok) {
        if (
          data.error === "QUOTA_FREE_PLAN" ||
          data.error === "QUOTA_EXCEEDED"
        ) {
          setPaywallReason(
            data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded"
          );
          setPaywallPlan(
            data.plan === "starter"
              ? "starter"
              : data.plan === "pro"
                ? "pro"
                : undefined
          );
          setPaywallOpen(true);
          return;
        }

        if (data.code === "PDF_NO_TEXT" || data.code === "PDF_SCANNED") {
          setPdfError(t("aiGenerator.errorPdfNoText"));
          return;
        }

        if (data.code === "PDF_ENCRYPTED") {
          setPdfError(t("aiGenerator.errorPdfEncrypted"));
          return;
        }

        if (data.code === "PDF_INVALID") {
          setPdfError(t("aiGenerator.errorPdfCorrupted"));
          return;
        }

        const errorMessage =
          data.message ||
          data.error ||
          t("aiGenerator.errorPdfGeneration");
        setPdfError(errorMessage);
        return;
      }

      // Success - show preview
      setGeneratedCards(data.cards);
      setSelectedIndices(
        new Set(data.cards.map((_: unknown, i: number) => i))
      );
      setSourcePdf(file);
      setSourceText("");
    } catch (error) {
      console.error("Error generating cards from PDF:", error);
      setPdfError(
        error instanceof Error ? error.message : "Failed to process PDF"
      );
    } finally {
      setPdfLoading(false);
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
    }
  };

  /**
   * Opens the device camera (native iOS) or falls back to the file picker (web).
   * The captured image is converted to a File and sent through the same upload
   * pipeline as handlePdfUpload — no new backend endpoint needed.
   */
  const handleTakePhoto = async () => {
    if (!canUseAI) return;

    // Web fallback: trigger the existing file input (accepts image/*)
    if (!Capacitor.isNativePlatform()) {
      pdfInputRef.current?.click();
      return;
    }

    setCameraLoading(true);
    setPdfError(null);

    try {
      // Dynamically import so the Camera module is never loaded on the server
      const { Camera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );

      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 90,
        allowEditing: false,
        saveToGallery: false,
      });

      if (!photo.webPath) {
        setPdfError(t("aiGenerator.errorCamera"));
        return;
      }

      // Convert webPath → Blob → File so we can reuse the exact same pipeline
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const mimeType = blob.type || "image/jpeg";
      const ext = mimeType.split("/")[1] || "jpg";
      const file = new File([blob], `photo.${ext}`, { type: mimeType });

      // Reuse the existing upload handler via a synthetic input-change event
      const dt = new DataTransfer();
      dt.items.add(file);
      const syntheticEvent = {
        target: { files: dt.files },
      } as React.ChangeEvent<HTMLInputElement>;
      await handlePdfUpload(syntheticEvent);
    } catch (err: unknown) {
      // CameraPluginError: user cancelled — don't show an error
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.toLowerCase().includes("cancelled") ||
        message.toLowerCase().includes("canceled") ||
        message.toLowerCase().includes("user cancelled") ||
        message.toLowerCase().includes("no image")
      ) {
        return;
      }
      console.error("Camera capture failed:", err);
      setPdfError(t("aiGenerator.errorCamera"));
    } finally {
      setCameraLoading(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!canGenerateWithAI) return;

    setAiLoading(true);
    resetPreview();

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAiError("No Supabase session. Please log in again.");
        setAiLoading(false);
        return;
      }

      const payload: {
        deck_id: string;
        language: string;
        text: string;
        cardsCount?: number;
        detailLevel?: "summary" | "standard" | "detailed";
        mode?: DeckMode;
      } = {
        deck_id: String(deckId),
        language: "fr",
        text: aiText.trim(),
      };

      if (cardsCount !== undefined) {
        payload.cardsCount = cardsCount;
      }
      if (detailLevel !== "standard") {
        payload.detailLevel = detailLevel;
      }
      if (deckMode) {
        payload.mode = deckMode;
      }

      const response = await fetch(`${BACKEND_URL}/generate/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (
          data.error === "QUOTA_FREE_PLAN" ||
          data.error === "QUOTA_EXCEEDED"
        ) {
          setPaywallReason(
            data.error === "QUOTA_FREE_PLAN" ? "free_plan" : "quota_exceeded"
          );
          setPaywallPlan(
            data.plan === "starter"
              ? "starter"
              : data.plan === "pro"
                ? "pro"
                : undefined
          );
          setPaywallOpen(true);
          return;
        }
        setAiError(data.error || "Failed to generate cards");
        return;
      }

      // Success - show preview
      setGeneratedCards(data.cards);
      setSelectedIndices(
        new Set(data.cards.map((_: unknown, i: number) => i))
      );
      setSourceText(aiText.trim());
      setSourcePdf(null);
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

  return (
    <>
      <div className={`rounded-xl border bg-muted/30 p-6 space-y-5 ${className ?? ""}`}>
        {/* Quota Indicator */}
        <QuotaIndicator />

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {t("aiGenerator.title")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("aiGenerator.subtitle")}
          </p>
        </div>

        {/* Input - hide when preview is showing */}
        {!generatedCards && (
          <div className="space-y-4">
            {/* PDF / photo upload — hidden on iOS native (handled by Import Vocabulary button) */}
            {!Capacitor.isNativePlatform() && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf,image/*"
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
                        {pdfLoading ? t("aiGenerator.processingFile") : t("aiGenerator.importFile")}
                      </span>
                    </label>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t("aiGenerator.fileTip")}
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-muted/30 px-2 text-muted-foreground">
                      {t("aiGenerator.or")}
                    </span>
                  </div>
                </div>
              </>
            )}

            <Textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={6}
              className="bg-background"
              placeholder={
                !canUseAI
                  ? t("aiGenerator.subscriberOnlyPlaceholder")
                  : t("aiGenerator.textPlaceholder")
              }
              disabled={!canUseAI}
            />
            {!canUseAI ? (
              <div className="rounded-lg border border-muted bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                {t("aiGenerator.subscriberOnly")}
              </div>
            ) : (
              <>
                {/* Generation options */}
                <div className="space-y-3 rounded-lg border border-muted/50 bg-muted/20 p-3">
                  {/* Cards count selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("aiGenerator.cardsCount")}
                    </label>
                    <div className="flex gap-1.5">
                      {[
                        { value: undefined as number | undefined, label: "Auto" },
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 20, label: "20" },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setCardsCount(option.value)}
                          disabled={aiLoading || pdfLoading}
                          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                            cardsCount === option.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-muted hover:bg-muted/50"
                          } ${aiLoading || pdfLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Detail level selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("aiGenerator.detailLevel")}
                    </label>
                    <select
                      value={detailLevel}
                      onChange={(e) =>
                        setDetailLevel(
                          e.target.value as
                            | "summary"
                            | "standard"
                            | "detailed"
                        )
                      }
                      disabled={aiLoading || pdfLoading}
                      className="w-full px-3 py-1.5 text-sm rounded-md border border-muted bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="summary">{t("aiGenerator.summary")}</option>
                      <option value="standard">{t("aiGenerator.standard")}</option>
                      <option value="detailed">{t("aiGenerator.detailed")}</option>
                    </select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateWithAI}
                  disabled={!canGenerateWithAI || pdfLoading}
                  className="w-full"
                  size="lg"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {aiLoading || pdfLoading
                    ? t("aiGenerator.generating")
                    : cardsCount !== undefined
                      ? t("aiGenerator.generateCount", { count: cardsCount })
                      : t("aiGenerator.generateForDeck")}
                </Button>
              </>
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
                {confirmedCount > 1
                  ? t("aiGenerator.cardsAddedPlural", { count: confirmedCount })
                  : t("aiGenerator.cardsAddedSingular", { count: confirmedCount })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("aiGenerator.canModifyCards")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setConfirmedCount(null)}
              className="w-full"
            >
              {t("aiGenerator.generateMore")}
            </Button>
          </div>
        )}

        {/* Preview state - cards generated but not confirmed */}
        {generatedCards && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {generatedCards.length > 1
                  ? t("aiGenerator.generatedBannerPlural", { count: generatedCards.length })
                  : t("aiGenerator.generatedBannerSingular", { count: generatedCards.length })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("aiGenerator.generatedBannerHint")}
              </p>
            </div>

            {/* Global actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={
                  regeneratingAll ||
                  regeneratingIndex !== null ||
                  confirmLoading
                }
                className="flex-1"
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                {t("aiGenerator.acceptAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={
                  regeneratingAll ||
                  regeneratingIndex !== null ||
                  confirmLoading
                }
                className="flex-1"
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t("aiGenerator.rejectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateAll}
                disabled={
                  regeneratingAll ||
                  regeneratingIndex !== null ||
                  confirmLoading ||
                  (!sourceText && !sourcePdf)
                }
                className="flex-1"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${regeneratingAll ? "animate-spin" : ""}`}
                />
                {regeneratingAll ? t("aiGenerator.regenerating") : t("aiGenerator.regenerateAll")}
              </Button>
            </div>

            {/* Card list with selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {selectedIndices.size > 1
                  ? t("aiGenerator.cardsSelectedPlural", { selected: selectedIndices.size, total: generatedCards.length })
                  : t("aiGenerator.cardsSelectedSingular", { selected: selectedIndices.size, total: generatedCards.length })}
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
                            <p className="text-xs font-medium text-primary mb-1">
                              {t("aiGenerator.question")}
                            </p>
                            <p className="text-sm">{card.front}</p>
                          </div>
                          <div className="border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              {t("aiGenerator.answer")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {card.back}
                            </p>
                          </div>
                        </div>
                        {/* Card action buttons */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleCard(index)}
                            disabled={
                              regeneratingAll ||
                              regeneratingIndex !== null ||
                              confirmLoading
                            }
                            className={`${
                              isSelected
                                ? "bg-green-600 hover:bg-green-700"
                                : "hover:border-destructive hover:text-destructive"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRegenerateCard(index)}
                            disabled={
                              regeneratingAll ||
                              regeneratingIndex !== null ||
                              confirmLoading ||
                              (!sourceText && !sourcePdf)
                            }
                            title={t("aiGenerator.regenerateCard")}
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${regeneratingIndex === index ? "animate-spin" : ""}`}
                            />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteCard(index)}
                            disabled={
                              regeneratingAll ||
                              regeneratingIndex !== null ||
                              confirmLoading
                            }
                            className="hover:border-destructive hover:text-destructive"
                            title={t("aiGenerator.deleteCard")}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
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
                disabled={
                  confirmLoading ||
                  regeneratingAll ||
                  regeneratingIndex !== null
                }
                className="flex-1"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleConfirmCards}
                disabled={
                  selectedIndices.size === 0 ||
                  confirmLoading ||
                  regeneratingAll ||
                  regeneratingIndex !== null
                }
                className="flex-1"
              >
                {confirmLoading ? (
                  t("aiGenerator.adding")
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {selectedIndices.size > 1
                      ? t("aiGenerator.addCardsPlural", { count: selectedIndices.size })
                      : t("aiGenerator.addCardsSingular", { count: selectedIndices.size })}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state - no cards generated */}
        {generatedCards && generatedCards.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {t("aiGenerator.noCardsGenerated")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("aiGenerator.noCardsHint")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={resetPreview}
              className="w-full"
            >
              {t("common.back")}
            </Button>
          </div>
        )}
      </div>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason={paywallReason}
        plan={paywallPlan}
      />
    </>
  );
}
