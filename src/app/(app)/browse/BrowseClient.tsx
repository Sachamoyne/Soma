"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RichCardInput } from "@/components/RichCardInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Edit, Pause, Play, Save, X } from "lucide-react";
import {
  listAllCards,
  deleteCard,
  updateCard,
  suspendCard,
  unsuspendCard,
  setCardDueDate,
  forgetCard,
  setCardMarked,
  listDecksWithPaths,
  formatInterval,
} from "@/store/decks";
import type { Card as CardType } from "@/lib/db";
import { CARD_TYPES, type CardType as CardTypeEnum } from "@/lib/card-types";
import { MoveCardsDialog } from "@/components/MoveCardsDialog";
import { CardContextMenu } from "@/components/cards/CardContextMenu";
import { useTranslation } from "@/i18n";

function stripAndTruncate(html: string, maxLength: number = 80): string {
  const text = html.replace(/<[^>]*>/g, "").trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function capitalizeValue(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function BrowseAllCardsPage() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogCardIds, setMoveDialogCardIds] = useState<string[]>([]);
  const [decksWithPaths, setDecksWithPaths] = useState<
    Array<{ deckId: string; path: string }>
  >([]);
  const [contextMenu, setContextMenu] = useState<{
    cardId: string;
    x: number;
    y: number;
  } | null>(null);
  const [dueDateDialogOpen, setDueDateDialogOpen] = useState(false);
  const [dueDateValue, setDueDateValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const lastSelectedIndex = useRef<number | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editCardType, setEditCardType] = useState<CardTypeEnum>("basic");

  const deckPathById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of decksWithPaths) {
      map.set(entry.deckId, entry.path);
    }
    return map;
  }, [decksWithPaths]);

  const getNextReviewText = (card: CardType): string => {
    const now = Date.now();
    const dueTime = new Date(card.due_at).getTime();

    if (dueTime <= now) {
      return t("browse.dueNow");
    }

    const diffMs = dueTime - now;
    const diffMinutes = diffMs / (1000 * 60);

    return t("browse.inTime", { time: formatInterval(diffMinutes) });
  };

  const getStateBadge = (card: CardType): { label: string; color: string } => {
    if (card.suspended) {
      return { label: t("cardStates.suspended"), color: "bg-muted text-muted-foreground" };
    }

    switch (card.state) {
      case "new":
        return { label: t("cardStates.new"), color: "bg-sky-500/10 text-sky-600" };
      case "learning":
      case "relearning":
        return { label: t("cardStates.learning"), color: "bg-amber-500/10 text-amber-600" };
      case "review":
        return { label: t("cardStates.review"), color: "bg-emerald-500/10 text-emerald-600" };
      default:
        return { label: card.state, color: "bg-muted text-muted-foreground" };
    }
  };

  const loadCards = async () => {
    setLoading(true);
    setError(null);

    try {
      const [allCards, decks] = await Promise.all([
        listAllCards(),
        listDecksWithPaths(),
      ]);

      setCards(
        allCards.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
      setDecksWithPaths(decks.map((d) => ({ deckId: d.deck.id, path: d.path })));
    } catch (err) {
      console.error("Error loading cards:", err);
      setError(t("browse.failedToLoad"));
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStartIndex(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isDragging]);

  const activeCard = activeCardId ? cards.find((c) => c.id === activeCardId) : null;
  const activeCardDeckPath = activeCard
    ? deckPathById.get(activeCard.deck_id) || "Unknown deck"
    : null;
  const contextCard = contextMenu ? cards.find((c) => c.id === contextMenu.cardId) : null;
  const contextCardMarked = Boolean((contextCard?.extra as any)?.marked);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm(t("common.confirm") + "?")) return;

    try {
      await deleteCard(cardId);
      if (activeCardId === cardId) {
        setActiveCardId(null);
      }
      await loadCards();
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const handleStartEdit = () => {
    if (!activeCard) return;
    setEditFront(activeCard.front);
    setEditBack(activeCard.back);
    setEditCardType((activeCard.type as CardTypeEnum) || "basic");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!activeCardId || !editFront.trim() || !editBack.trim()) return;

    try {
      await updateCard(activeCardId, editFront.trim(), editBack.trim(), editCardType);
      setIsEditing(false);
      await loadCards();
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSuspendCard = async (cardId: string) => {
    try {
      await suspendCard(cardId);
      await loadCards();
    } catch (error) {
      console.error("Error suspending card:", error);
    }
  };

  const handleUnsuspendCard = async (cardId: string) => {
    try {
      await unsuspendCard(cardId);
      await loadCards();
    } catch (error) {
      console.error("Error unsuspending card:", error);
    }
  };

  const selectAllCards = () => {
    setSelectedCardIds(new Set(cards.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedCardIds(new Set());
  };

  const handleMoveCards = async () => {
    await loadCards();
    clearSelection();
  };

  const handleRowClick = (cardId: string) => {
    setActiveCardId(cardId);
    setIsEditing(false);
  };

  const handleRowMouseDown = (
    e: React.MouseEvent,
    cardId: string,
    index: number
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();

    setActiveCardId(cardId);
    setIsEditing(false);

    if (e.shiftKey && lastSelectedIndex.current !== null) {
      const start = Math.min(lastSelectedIndex.current, index);
      const end = Math.max(lastSelectedIndex.current, index);
      const next = new Set(cards.slice(start, end + 1).map((c) => c.id));
      setSelectedCardIds(next);
      lastSelectedIndex.current = index;
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      setSelectedCardIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else {
          next.add(cardId);
        }
        return next;
      });
      lastSelectedIndex.current = index;
      return;
    }

    setSelectedCardIds(new Set([cardId]));
    lastSelectedIndex.current = index;
    setIsDragging(true);
    setDragStartIndex(index);
  };

  const handleRowMouseEnter = (index: number) => {
    if (!isDragging || dragStartIndex === null) return;
    const start = Math.min(dragStartIndex, index);
    const end = Math.max(dragStartIndex, index);
    setSelectedCardIds(new Set(cards.slice(start, end + 1).map((c) => c.id)));
  };

  const handleOpenContextMenu = (
    e: React.MouseEvent,
    cardId: string
  ) => {
    e.preventDefault();
    if (!selectedCardIds.has(cardId)) {
      setSelectedCardIds(new Set([cardId]));
      lastSelectedIndex.current = cards.findIndex((c) => c.id === cardId);
    }
    setContextMenu({
      cardId,
      x: e.clientX,
      y: e.clientY,
    });
    setActiveCardId(cardId);
    setIsEditing(false);
  };

  const handleSetDueDate = async () => {
    if (!contextCard || !dueDateValue) return;
    const targetIds = selectedCardIds.size
      ? Array.from(selectedCardIds)
      : [contextCard.id];
    const dueAtIso = new Date(`${dueDateValue}T00:00:00`).toISOString();
    await Promise.all(targetIds.map((id) => setCardDueDate(id, dueAtIso)));
    setDueDateDialogOpen(false);
    await loadCards();
  };

  return (
    <>
      <Topbar title={t("browse.title")} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 md:px-10 py-4 md:py-8">
          {loading ? (
            <div className="rounded-xl border border-border bg-background px-8 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-muted-foreground">{t("browse.loadingCards")}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button variant="outline" onClick={loadCards}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {cards.length} {cards.length === 1 ? t("dashboard.card") : t("dashboard.cards")}
                  </p>
                </div>

                {selectedCardIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {selectedCardIds.size} {t("common.selected")}
                    </span>
                    <Button variant="outline" size="sm" onClick={selectAllCards}>
                      {t("common.selectAll")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={clearSelection}>
                      {t("common.clear")}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setMoveDialogCardIds(Array.from(selectedCardIds));
                        setMoveDialogOpen(true);
                      }}
                    >
                      {t("common.moveTo")}
                    </Button>
                  </div>
                )}
              </div>

              {cards.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-lg mb-3">{t("browse.noCards")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("browse.noCardsHint")}
                  </p>
                </div>
              ) : (
                <div className="flex gap-4 h-[calc(100vh-280px)]">
                  <div className="flex-1 border border-border rounded-xl overflow-hidden flex flex-col bg-background shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="border-b border-border/60 bg-foreground/[0.02] px-4 py-2 flex items-center text-xs font-medium text-muted-foreground">
                      <div className="flex-1">{t("browse.front")}</div>
                      <div className="hidden md:block w-40">{t("decks.deck")}</div>
                      <div className="hidden md:block w-24">{t("browse.state")}</div>
                      <div className="hidden md:block w-32">{t("browse.due")}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {cards.map((card, index) => {
                        const isSelected = selectedCardIds.has(card.id);
                        const isActive = activeCardId === card.id;
                        const badge = getStateBadge(card);
                        const deckPath = deckPathById.get(card.deck_id) || "Unknown deck";

                        return (
                          <div
                            key={card.id}
                            onMouseDown={(e) => handleRowMouseDown(e, card.id, index)}
                            onMouseEnter={() => handleRowMouseEnter(index)}
                            onClick={() => handleRowClick(card.id)}
                            onContextMenu={(e) => handleOpenContextMenu(e, card.id)}
                            onDoubleClick={(e) => handleOpenContextMenu(e, card.id)}
                            className={`
                              flex items-center px-4 py-2 border-b cursor-pointer transition-colors select-none
                              ${isActive ? "bg-foreground/[0.06] border-l-4 border-l-foreground" : isSelected ? "bg-foreground/[0.04] border-l-4 border-l-foreground/50" : "border-l-4 border-l-transparent hover:bg-foreground/[0.02]"}
                              ${card.suspended ? "opacity-60" : ""}
                            `}
                          >
                            <div className={`flex-1 text-sm truncate pr-4 ${isSelected ? "text-foreground font-medium" : "text-foreground"}`}>
                              {stripAndTruncate(card.front, 100)}
                            </div>

                            <div className="hidden md:block w-40 text-xs text-muted-foreground truncate pr-2">
                              {deckPath}
                            </div>

                            <div className="hidden md:block w-24">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                                {badge.label}
                              </span>
                            </div>

                            <div className="hidden md:block w-32 text-sm text-muted-foreground">
                              {getNextReviewText(card)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hidden md:flex w-96 border border-border rounded-xl overflow-hidden flex-col bg-background shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    {activeCard ? (
                      <>
                        <div className="border-b border-border/60 px-4 py-3 flex items-center justify-between bg-foreground/[0.02]">
                          <h3 className="font-medium text-sm">{t("browse.cardPreview")}</h3>
                          <div className="flex gap-1">
                            {!isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleStartEdit}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  {t("common.edit")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    activeCard.suspended
                                      ? handleUnsuspendCard(activeCard.id)
                                      : handleSuspendCard(activeCard.id)
                                  }
                                >
                                  {activeCard.suspended ? (
                                    <Play className="h-4 w-4" />
                                  ) : (
                                    <Pause className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCard(activeCard.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={handleSaveEdit}
                                >
                                  <Save className="h-4 w-4 mr-1" />
                                  {t("common.save")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          {!isEditing ? (
                            <>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                                  {t("browse.front")}
                                </p>
                                <div
                                  className="prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: activeCard.front }}
                                />
                              </div>

                              <Separator />

                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                                  {t("browse.back")}
                                </p>
                                <div
                                  className="prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: activeCard.back }}
                                />
                              </div>

                              <Separator />

                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("decks.deck")}:</span>
                                  <span className="font-medium">{activeCardDeckPath}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("browse.type")}:</span>
                                  <span className="font-medium">{capitalizeValue(activeCard.type)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("browse.state")}:</span>
                                  <span className="font-medium">
                                    {capitalizeValue(getStateBadge(activeCard).label)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("browse.due")}:</span>
                                  <span className="font-medium">{getNextReviewText(activeCard)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("browse.interval")}:</span>
                                  <span className="font-medium">{activeCard.interval_days} {t("common.days")}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("browse.reviews")}:</span>
                                  <span className="font-medium">{activeCard.reps}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <label className="mb-2 block text-sm font-medium">{t("browse.cardType")}</label>
                                <Select
                                  value={editCardType}
                                  onValueChange={(value) => setEditCardType(value as CardTypeEnum)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CARD_TYPES.map((type) => (
                                      <SelectItem key={type.id} value={type.id}>
                                        {type.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <RichCardInput
                                label={t("browse.front")}
                                value={editFront}
                                onChange={setEditFront}
                                placeholder={t("browse.questionPlaceholder")}
                              />

                              <RichCardInput
                                label={t("browse.back")}
                                value={editBack}
                                onChange={setEditBack}
                                placeholder={t("browse.answerPlaceholder")}
                              />
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center p-8">
                        <div>
                          <p className="text-muted-foreground mb-2">{t("browse.noCardSelected")}</p>
                          <p className="text-sm text-muted-foreground">
                            {t("browse.clickToPreview")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <MoveCardsDialog
                open={moveDialogOpen}
                onOpenChange={setMoveDialogOpen}
                cardIds={moveDialogCardIds}
                currentDeckId=""
                onSuccess={handleMoveCards}
              />
            </>
          )}
        </div>
      </div>
      <CardContextMenu
        open={!!contextMenu && !!contextCard}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        suspended={!!contextCard?.suspended}
        marked={contextCardMarked}
        onChangeDeck={() => {
          if (!contextCard) return;
          const targetIds = selectedCardIds.size
            ? Array.from(selectedCardIds)
            : [contextCard.id];
          setMoveDialogCardIds(targetIds);
          setMoveDialogOpen(true);
          setContextMenu(null);
        }}
        onSetDueDate={() => {
          if (!contextCard) return;
          const existingDate = new Date(contextCard.due_at)
            .toISOString()
            .slice(0, 10);
          setDueDateValue(existingDate);
          setDueDateDialogOpen(true);
          setContextMenu(null);
        }}
        onForget={async () => {
          if (!contextCard) return;
          const targetIds = selectedCardIds.size
            ? Array.from(selectedCardIds)
            : [contextCard.id];
          await Promise.all(targetIds.map((id) => forgetCard(id)));
          setContextMenu(null);
          await loadCards();
        }}
        onToggleSuspend={async () => {
          if (!contextCard) return;
          const targetIds = selectedCardIds.size
            ? Array.from(selectedCardIds)
            : [contextCard.id];
          if (contextCard.suspended) {
            await Promise.all(targetIds.map((id) => unsuspendCard(id)));
          } else {
            await Promise.all(targetIds.map((id) => suspendCard(id)));
          }
          setContextMenu(null);
          await loadCards();
        }}
        onToggleMark={async () => {
          if (!contextCard) return;
          const targetIds = selectedCardIds.size
            ? Array.from(selectedCardIds)
            : [contextCard.id];
          const selectedMarked = cards.filter((c) => targetIds.includes(c.id));
          const nextMarked = !selectedMarked.every((c) => (c.extra as any)?.marked);
          await Promise.all(targetIds.map((id) => setCardMarked(id, nextMarked)));
          setContextMenu(null);
          await loadCards();
        }}
      />
      <Dialog open={dueDateDialogOpen} onOpenChange={setDueDateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dueDate.title")}</DialogTitle>
            <DialogDescription>
              {t("dueDate.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="date"
              value={dueDateValue}
              onChange={(e) => setDueDateValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueDateDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSetDueDate} disabled={!dueDateValue}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
