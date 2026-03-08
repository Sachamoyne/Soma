"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/hooks/useAppRouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookOpen, CalendarDays, Trash2 } from "lucide-react";
import { getAnkiCountsForDecks, deleteDeck, invalidateCardCaches, getExamStats } from "@/store/decks";
import { getDeckSettings, setExamDate } from "@/store/deck-settings";
import { useTranslation } from "@/i18n";
import type { ExamStats } from "@/lib/supabase-db";

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

  // Exam mode state
  const [examStats, setExamStats] = useState<ExamStats | null>(null);
  const [currentExamDate, setCurrentExamDate] = useState<string | null>(null);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [examDateInput, setExamDateInput] = useState("");
  const [savingExam, setSavingExam] = useState(false);

  async function loadData() {
    try {
      const normalizedDeckId = String(deckId);
      const [{ due, total }, deckSettings, stats] = await Promise.all([
        getAnkiCountsForDecks([normalizedDeckId]),
        getDeckSettings(normalizedDeckId),
        getExamStats(normalizedDeckId),
      ]);
      const counts = due[normalizedDeckId] || { new: 0, learning: 0, review: 0 };
      setCardCounts(counts);
      setTotalCards(total[normalizedDeckId] || 0);
      setCurrentExamDate(deckSettings.examDate);
      setExamStats(stats);
    } catch (error) {
      console.error("Error loading card counts:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [deckId]);

  useEffect(() => {
    const handleCountsUpdated = () => {
      setLoading(true);
      invalidateCardCaches();
      loadData();
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

  const handleOpenExamDialog = () => {
    setExamDateInput(currentExamDate || "");
    setExamDialogOpen(true);
  };

  const handleSaveExam = async () => {
    if (!examDateInput) return;
    setSavingExam(true);
    try {
      await setExamDate(String(deckId), examDateInput);
      setExamDialogOpen(false);
      setCurrentExamDate(examDateInput);
      // Reload stats
      const stats = await getExamStats(String(deckId));
      setExamStats(stats);
    } catch (error) {
      console.error("Error saving exam date:", error);
    } finally {
      setSavingExam(false);
    }
  };

  const handleCancelExam = async () => {
    if (!confirm(t("examMode.cancelExamConfirm"))) return;
    try {
      await setExamDate(String(deckId), null);
      setCurrentExamDate(null);
      setExamStats(null);
    } catch (error) {
      console.error("Error cancelling exam:", error);
    }
  };

  const hasDueCards = (cardCounts.new + cardCounts.learning + cardCounts.review) > 0;
  const examIsActive = !!currentExamDate && !!examStats;

  // Minimum date for exam picker = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-12 lg:space-y-16">
      {/* Card counts */}
      <div className="flex justify-center">
        <div className="grid grid-cols-3 gap-6 md:gap-16 lg:gap-24 py-4 md:py-8 lg:py-12">
          <div className="text-center">
            <div className="text-4xl md:text-6xl lg:text-7xl font-bold text-blue-600 dark:text-blue-400 mb-1 md:mb-3 lg:mb-4">
              {cardCounts.new}
            </div>
            <div className="text-xs md:text-sm lg:text-base font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.new")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl md:text-6xl lg:text-7xl font-bold text-orange-600 dark:text-orange-400 mb-1 md:mb-3 lg:mb-4">
              {cardCounts.learning}
            </div>
            <div className="text-xs md:text-sm lg:text-base font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.learning")}
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl md:text-6xl lg:text-7xl font-bold text-green-600 dark:text-green-400 mb-1 md:mb-3 lg:mb-4">
              {cardCounts.review}
            </div>
            <div className="text-xs md:text-sm lg:text-base font-medium text-muted-foreground uppercase tracking-wider">
              {t("deckOverview.toReview")}
            </div>
          </div>
        </div>
      </div>

      {/* Study button */}
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

      {/* Exam mode dashboard */}
      {examIsActive && examStats && (
        <div className="border rounded-xl p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {t("examMode.preparation")}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenExamDialog}
              className="text-xs text-muted-foreground"
            >
              {t("examMode.editExam")}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{examStats.daysRemaining}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("examMode.daysRemaining")}</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{examStats.dailyTarget}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("examMode.dailyGoal")}</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{examStats.readinessScore}%</div>
              <div className="text-xs text-muted-foreground mt-1">{t("examMode.readiness")}</div>
            </div>
          </div>

          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${examStats.readinessScore}%` }}
            />
          </div>

          <div className="flex justify-center pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelExam}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              {t("examMode.cancelExam")}
            </Button>
          </div>
        </div>
      )}

      {/* Schedule exam button (when no exam active) */}
      {!examIsActive && totalCards > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenExamDialog}
            className="text-muted-foreground gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            {t("examMode.scheduleExam")}
          </Button>
        </div>
      )}

      {/* Delete deck */}
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

      {/* Exam date picker dialog */}
      <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("examMode.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("examMode.dialogDesc")}</DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <label className="block text-sm font-medium mb-2">
              {t("examMode.examDate")}
            </label>
            <input
              type="date"
              value={examDateInput}
              min={minDate}
              onChange={(e) => setExamDateInput(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setExamDialogOpen(false)}
              disabled={savingExam}
            >
              {t("examMode.cancel")}
            </Button>
            <Button
              onClick={handleSaveExam}
              disabled={!examDateInput || savingExam}
            >
              {t("examMode.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
