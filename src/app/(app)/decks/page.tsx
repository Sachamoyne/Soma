"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";
import { DeckTree } from "@/components/DeckTree";
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
import { listDecks, createDeck, getAnkiCountsForDecks, invalidateDeckCaches, invalidateCardCaches } from "@/store/decks";
import type { DeckMode, VocabDirection, LanguagesConfig } from "@/lib/supabase-db";
import { ImportDialog } from "@/components/ImportDialog";
import type { Deck } from "@/lib/db";
import { useAppRouter } from "@/hooks/useAppRouter";
import { DeckSettingsMenu } from "@/components/DeckSettingsMenu";
import { BookOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n";

export default function DecksPage() {
  const { t } = useTranslation();
  const isApp = useIsApp();
  const router = useAppRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [learningCounts, setLearningCounts] = useState<
    Record<string, { new: number; learning: number; review: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckMode, setDeckMode] = useState<DeckMode>("classic");
  const [expandedDeckIds, setExpandedDeckIds] = useState<Set<string>>(new Set());
  // Languages mode options
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [vocabDirection, setVocabDirection] = useState<VocabDirection>("normal");

  const loadDecks = async () => {
    setLoadError(null);
    try {
      const loadedDecks = await listDecks();
      setDecks(loadedDecks);

      const deckIds = loadedDecks.map((d) => d.id);
      if (deckIds.length === 0) {
        setCardCounts({});
        setLearningCounts({});
        return;
      }

      const { due, total } = await getAnkiCountsForDecks(deckIds);

      const nextTotals: Record<string, number> = {};
      const nextDue: Record<string, { new: number; learning: number; review: number }> = {};

      for (const deckId of deckIds) {
        nextTotals[deckId] = total[deckId] || 0;
        nextDue[deckId] = due[deckId] || { new: 0, learning: 0, review: 0 };
      }

      setCardCounts(nextTotals);
      setLearningCounts(nextDue);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[DecksPage] load failed:", error);
      }
      setLoadError("Network error. Please check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDecks();
  }, []);

  useEffect(() => {
    const handleCountsUpdated = () => {
      loadDecks();
    };
    window.addEventListener("soma-counts-updated", handleCountsUpdated);
    return () => {
      window.removeEventListener("soma-counts-updated", handleCountsUpdated);
    };
  }, []);

  const handleCreateDeck = async () => {
    if (!deckName.trim()) return;
    
    // Validate languages mode requirements
    if (deckMode === "languages") {
      if (!sourceLanguage.trim() || !targetLanguage.trim()) {
        alert(t("decks.sourceLanguage") + " / " + t("decks.targetLanguage") + " required");
        return;
      }
    }

    try {
      // Build config for languages mode
      const config: LanguagesConfig | undefined = deckMode === "languages" 
        ? {
            sourceLanguage: sourceLanguage.trim(),
            targetLanguage: targetLanguage.trim(),
            vocabDirection,
          }
        : undefined;
      
      await createDeck(deckName.trim(), null, deckMode, config);
      await loadDecks();
      // Reset form
      setDeckName("");
      setDeckMode("classic");
      setSourceLanguage("");
      setTargetLanguage("");
      setVocabDirection("normal");
      setDialogOpen(false);
    } catch (error) {
      console.error("Error creating deck:", error);
      alert("Error creating deck: " + (error as Error).message);
    }
  };

  const handleImportSuccess = async () => {
    invalidateDeckCaches();
    invalidateCardCaches();
    await loadDecks();
  };

  const rootDecks = decks.filter((d) => !d.parent_deck_id);

  return (
    <>
      <Topbar
        title={t("decks.title")}
        showNewDeck
        onNewDeck={() => setDialogOpen(true)}
        showImport
        onImport={() => setImportDialogOpen(true)}
        importLabel={t("import.importAnkiDeck")}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-10 py-8">
          {loading ? (
            <div className="rounded-xl border border-border bg-background px-8 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-muted-foreground">{t("decks.loadingDecks")}</p>
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-border bg-background px-8 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-lg font-semibold text-foreground mb-2">Network error</h3>
              <p className="text-muted-foreground mb-6">{loadError}</p>
              <Button onClick={loadDecks}>Retry</Button>
            </div>
          ) : rootDecks.length === 0 ? (
            <div className="rounded-xl border border-border bg-background px-8 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t("decks.noDecks")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t("decks.createFirstDeck")}
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                {t("decks.createFirst")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mobile list as vertical cards */}
              <div className="space-y-3 md:hidden">
                {rootDecks.map((deck) => {
                  const counts = learningCounts[deck.id] || {
                    new: 0,
                    learning: 0,
                    review: 0,
                  };
                  const total = cardCounts[deck.id] || 0;

                  return (
                    <div
                      key={deck.id}
                      className="rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] cursor-pointer"
                      onClick={() => router.push(appHref(`/decks/${deck.id}`, isApp))}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-foreground">
                            {deck.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("decks.total")} : {total}
                          </p>
                        </div>
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <DeckSettingsMenu
                            deckId={deck.id}
                            deckName={deck.name}
                            onUpdate={loadDecks}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2 text-xs">
                        <span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-600">
                          {t("decks.new")} : {counts.new}
                        </span>
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-600">
                          {t("decks.learning")} : {counts.learning}
                        </span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-600">
                          {t("decks.review")} : {counts.review}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table / tree layout (unchanged) */}
              <div className="hidden rounded-xl border border-border bg-background overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:block">
                <div className="flex items-center justify-between px-5 py-3 bg-foreground/[0.02] border-b border-border/60">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-4" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("decks.deck")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedDeckIds(new Set())}
                      className="h-7 px-2 text-xs"
                    >
                      {t("decks.collapseAll")}
                    </Button>

                    <div className="grid grid-cols-4 w-52 gap-3">
                      <span className="text-xs text-right text-muted-foreground">{t("decks.new")}</span>
                      <span className="text-xs text-right text-muted-foreground">{t("decks.learning")}</span>
                      <span className="text-xs text-right text-muted-foreground">{t("decks.review")}</span>
                      <span className="text-xs text-right text-muted-foreground">{t("decks.total")}</span>
                    </div>

                    <div className="w-16" />
                  </div>
                </div>

                {rootDecks.map((deck) => (
                  <DeckTree
                    key={deck.id}
                    deck={deck}
                    allDecks={decks}
                    cardCounts={cardCounts}
                    learningCounts={learningCounts}
                    level={0}
                    expandedDeckIds={expandedDeckIds}
                    onToggleExpand={(deckId) => {
                      setExpandedDeckIds((prev) => {
                        const next = new Set(prev);
                        next.has(deckId)
                          ? next.delete(deckId)
                          : next.add(deckId);
                        return next;
                      });
                    }}
                    onDeckCreated={loadDecks}
                    onDeckDeleted={loadDecks}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setDeckName("");
          setDeckMode("classic");
          setSourceLanguage("");
          setTargetLanguage("");
          setVocabDirection("normal");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("decks.newDeck")}</DialogTitle>
            <DialogDescription>
              {t("decks.newDeckDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deck-name">{t("decks.deckName")}</Label>
              <Input
                id="deck-name"
                placeholder={t("decks.deckName")}
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDeck()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-mode">{t("decks.revisionMode")}</Label>
              <Select value={deckMode} onValueChange={(value: DeckMode) => setDeckMode(value)}>
                <SelectTrigger id="deck-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">{t("decks.modeClassic")}</SelectItem>
                  <SelectItem value="math">{t("decks.modeMath")}</SelectItem>
                  <SelectItem value="languages">{t("decks.modeLanguages")}</SelectItem>
                  <SelectItem value="humanities">{t("decks.modeHumanities")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Languages mode options */}
            {deckMode === "languages" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source-language">{t("decks.sourceLanguage")}</Label>
                  <Input
                    id="source-language"
                    placeholder={t("decks.sourceLanguagePlaceholder")}
                    value={sourceLanguage}
                    onChange={(e) => setSourceLanguage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-language">{t("decks.targetLanguage")}</Label>
                  <Input
                    id="target-language"
                    placeholder={t("decks.targetLanguagePlaceholder")}
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vocab-direction">{t("decks.vocabDirection")}</Label>
                  <Select value={vocabDirection} onValueChange={(value: VocabDirection) => setVocabDirection(value)}>
                    <SelectTrigger id="vocab-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">{t("decks.vocabDirectionNormal")}</SelectItem>
                      <SelectItem value="reversed">{t("decks.vocabDirectionReversed")}</SelectItem>
                      <SelectItem value="both">{t("decks.vocabDirectionBoth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateDeck}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialDeckId={null}
        onSuccess={handleImportSuccess}
        ankiOnly
      />
    </>
  );
}
