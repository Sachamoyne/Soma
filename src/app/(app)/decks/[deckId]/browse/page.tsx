"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RichCardInput } from "@/components/RichCardInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Edit, Pause, Play, Save, X, ArrowLeft, ChevronRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  listCardsForDeckTree,
  deleteCard,
  updateCard,
  suspendCard,
  unsuspendCard,
  setCardDueDate,
  forgetCard,
  setCardMarked,
  formatInterval,
} from "@/store/decks";
import type { Card as CardType } from "@/lib/db";
import { CARD_TYPES, type CardType as CardTypeEnum } from "@/lib/card-types";
import { MoveCardsDialog } from "@/components/MoveCardsDialog";
import { CardContextMenu } from "@/components/cards/CardContextMenu";

// Helper to get next review text
function getNextReviewText(card: CardType): string {
  const now = Date.now();
  const dueTime = new Date(card.due_at).getTime();

  if (dueTime <= now) {
    return "Due now";
  }

  const diffMs = dueTime - now;
  const diffMinutes = diffMs / (1000 * 60);

  return `In ${formatInterval(diffMinutes)}`;
}

// Helper to strip HTML and truncate text
function stripAndTruncate(html: string, maxLength: number = 80): string {
  const text = html.replace(/<[^>]*>/g, "").trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

// Helper to get state badge styling
function getStateBadge(card: CardType): { label: string; color: string } {
  if (card.suspended) {
    return { label: "Suspended", color: "bg-muted text-muted-foreground" };
  }

  switch (card.state) {
    case "new":
      return { label: "New", color: "bg-sky-500/10 text-sky-600" };
    case "learning":
    case "relearning":
      return { label: "Learning", color: "bg-amber-500/10 text-amber-600" };
    case "review":
      return { label: "Review", color: "bg-emerald-500/10 text-emerald-600" };
    default:
      return { label: card.state, color: "bg-muted text-muted-foreground" };
  }
}

function capitalizeValue(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function BrowseCardsPage() {
  const params = useParams();
  const deckId = params.deckId as string;
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [activeCardId, setActiveCardId] = useState<string | null>(null); // Currently previewed card
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogCardIds, setMoveDialogCardIds] = useState<string[]>([]);
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
  const isMobile = useMediaQuery("(max-width: 767px)");

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editCardType, setEditCardType] = useState<CardTypeEnum>("basic");

  const isFinePointer = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: fine)").matches;

  const loadCards = async () => {
    setLoading(true);
    setError(null);

    try {
      const normalizedDeckId = String(deckId);
      const allCards = await listCardsForDeckTree(normalizedDeckId);

      // Sort by creation date (newest first) - like Anki
      allCards.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setCards(allCards);
    } catch (err) {
      console.error("Error loading cards:", err);
      setError("Failed to load cards. Please try again.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, [deckId]);
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStartIndex(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isDragging]);

  const activeCard = activeCardId ? cards.find(c => c.id === activeCardId) : null;
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
    if (!confirm("Delete this card?")) return;

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
  const openContextMenuAt = (cardId: string, x: number, y: number) => {
    if (!selectedCardIds.has(cardId)) {
      setSelectedCardIds(new Set([cardId]));
      lastSelectedIndex.current = cards.findIndex((c) => c.id === cardId);
    }
    setContextMenu({
      cardId,
      x,
      y,
    });
    setActiveCardId(cardId);
    setIsEditing(false);
  };

  const handleOpenContextMenu = (e: React.MouseEvent, cardId: string) => {
    if (!isFinePointer()) return;
    e.preventDefault();
    openContextMenuAt(cardId, e.clientX, e.clientY);
  };

  const handleOpenContextMenuButton = (
    e: React.MouseEvent<HTMLButtonElement>,
    cardId: string
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenuAt(cardId, rect.right, rect.bottom);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading cards...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={loadCards}>
          Retry
        </Button>
      </div>
    );
  }

  /* ── Mobile: touch-friendly list → detail navigation ── */
  if (isMobile) {
    return (
      <>
        {activeCard ? (
          /* Card detail — full width */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-1 py-2 border-b border-border mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveCardId(null);
                  setIsEditing(false);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex-1" />
              {!isEditing ? (
                <>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleStartEdit}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() =>
                      activeCard.suspended
                        ? handleUnsuspendCard(activeCard.id)
                        : handleSuspendCard(activeCard.id)
                    }
                  >
                    {activeCard.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleDeleteCard(activeCard.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pb-4">
              {!isEditing ? (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Front</p>
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: activeCard.front }} />
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Back</p>
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: activeCard.back }} />
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">{capitalizeValue(activeCard.type)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">State:</span>
                      <span className="font-medium">{capitalizeValue(getStateBadge(activeCard).label)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Due:</span>
                      <span className="font-medium">{getNextReviewText(activeCard)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interval:</span>
                      <span className="font-medium">{activeCard.interval_days} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reviews:</span>
                      <span className="font-medium">{activeCard.reps}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Card Type</label>
                    <Select
                      value={editCardType}
                      onValueChange={(value) => setEditCardType(value as CardTypeEnum)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARD_TYPES.map((type) => (
                          <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <RichCardInput label="Front" value={editFront} onChange={setEditFront} placeholder="Question or front text" />
                  <RichCardInput label="Back" value={editBack} onChange={setEditBack} placeholder="Answer or back text" />
                </>
              )}
            </div>
          </div>
        ) : (
          /* Card list — touch-friendly rows */
          <>
            <div className="mb-3">
              <p className="text-sm text-muted-foreground">
                {cards.length} {cards.length === 1 ? "card" : "cards"} total
              </p>
            </div>

            {cards.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg mb-3">No cards in this deck yet.</p>
                <p className="text-sm text-muted-foreground">
                  Use the <strong>Add</strong> tab to create cards.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {cards.map((card) => {
                  const badge = getStateBadge(card);
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setActiveCardId(card.id);
                        setIsEditing(false);
                      }}
                      className={`flex items-center gap-3 px-2 py-3 active:bg-muted/50 min-h-[44px] cursor-pointer border-b border-border/30 ${
                        card.suspended ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {stripAndTruncate(card.front, 55)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] leading-tight px-1.5 py-0.5 rounded font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getNextReviewText(card)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Dialogs */}
        <MoveCardsDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          cardIds={moveDialogCardIds}
          currentDeckId={deckId}
          onSuccess={handleMoveCards}
        />
        <Dialog open={dueDateDialogOpen} onOpenChange={setDueDateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set due date</DialogTitle>
              <DialogDescription>Choose a new due date for this card.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input type="date" value={dueDateValue} onChange={(e) => setDueDateValue(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDueDateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSetDueDate} disabled={!dueDateValue}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  /* ── Desktop: split-view browse (unchanged) ── */
  return (
    <>
      {/* Header with actions */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {cards.length} {cards.length === 1 ? "card" : "cards"} total
          </p>
        </div>

        {/* Bulk actions */}
        {selectedCardIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedCardIds.size} selected
            </span>
            <Button variant="outline" size="sm" onClick={selectAllCards}>
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setMoveDialogCardIds(Array.from(selectedCardIds));
                setMoveDialogOpen(true);
              }}
            >
              Move to...
            </Button>
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg mb-3">No cards in this deck yet.</p>
          <p className="text-sm text-muted-foreground">
            Use the <strong>Add</strong> tab to create cards.
          </p>
        </div>
      ) : (
        /* SPLIT VIEW LAYOUT - Anki style */
        <div className="flex gap-4 h-[calc(100vh-280px)]">
          {/* LEFT: Dense table of cards */}
          <div className="flex-1 border rounded-lg overflow-hidden flex flex-col bg-background">
            {/* Table header */}
            <div className="border-b bg-muted/50 px-4 py-2 flex items-center text-xs font-medium text-muted-foreground">
            <div className="flex-1">Front</div>
            <div className="w-24">State</div>
            <div className="w-32">Due</div>
            </div>

            {/* Table body - scrollable */}
            <div className="flex-1 overflow-y-auto">
              {cards.map((card, index) => {
                const isSelected = selectedCardIds.has(card.id);
                const isActive = activeCardId === card.id;
                const badge = getStateBadge(card);

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
                      ${isActive ? "bg-primary/15 border-l-4 border-l-primary" : isSelected ? "bg-blue-50/80 border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent hover:bg-muted/40"}
                      ${card.suspended ? "opacity-60" : ""}
                    `}
                  >
                    {/* Front preview (truncated) */}
                    <div className={`flex-1 text-sm truncate pr-4 ${isSelected ? "text-foreground font-medium" : "text-foreground"}`}>
                      {stripAndTruncate(card.front, 100)}
                    </div>

                    {/* State badge */}
                    <div className="w-24">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Due date */}
                    <div className="w-32 text-sm text-muted-foreground">
                      {getNextReviewText(card)}
                    </div>

                    <div className="ml-2 sm:hidden">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-label="Card actions"
                        onClick={(e) => handleOpenContextMenuButton(e, card.id)}
                      >
                        <span className="text-lg leading-none">⋯</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Card preview panel */}
          <div className="w-96 border rounded-lg overflow-hidden flex flex-col bg-background">
            {activeCard ? (
              <>
                {/* Preview header */}
                <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/30">
                  <h3 className="font-medium text-sm">Card Preview</h3>
                  <div className="flex gap-1">
                    {!isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleStartEdit}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
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
                          Save
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

                {/* Preview content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {!isEditing ? (
                    <>
                      {/* View mode */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                          Front
                        </p>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: activeCard.front }}
                        />
                      </div>

                      <Separator />

                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                          Back
                        </p>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: activeCard.back }}
                        />
                      </div>

                      <Separator />

                      {/* Card metadata */}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium">{capitalizeValue(activeCard.type)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State:</span>
                          <span className="font-medium">
                            {capitalizeValue(getStateBadge(activeCard).label)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Due:</span>
                          <span className="font-medium">{getNextReviewText(activeCard)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Interval:</span>
                          <span className="font-medium">{activeCard.interval_days} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reviews:</span>
                          <span className="font-medium">{activeCard.reps}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Edit mode */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">Card Type</label>
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
                        label="Front"
                        value={editFront}
                        onChange={setEditFront}
                        placeholder="Question or front text"
                      />

                      <RichCardInput
                        label="Back"
                        value={editBack}
                        onChange={setEditBack}
                        placeholder="Answer or back text"
                      />
                    </>
                  )}
                </div>
              </>
            ) : (
              /* No card selected */
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <p className="text-muted-foreground mb-2">No card selected</p>
                  <p className="text-sm text-muted-foreground">
                    Click a card from the list to preview it
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move cards dialog */}
      <MoveCardsDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        cardIds={moveDialogCardIds}
        currentDeckId={deckId}
        onSuccess={handleMoveCards}
      />
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
            <DialogTitle>Set due date</DialogTitle>
            <DialogDescription>
              Choose a new due date for this card.
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
              Cancel
            </Button>
            <Button onClick={handleSetDueDate} disabled={!dueDateValue}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
