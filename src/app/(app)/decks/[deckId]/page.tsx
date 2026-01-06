"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb } from "@/components/Breadcrumb";
import { RichCardInput } from "@/components/RichCardInput";
import { Trash2, Plus, BookOpen, Upload, List, Edit, Pause, Play } from "lucide-react";
import {
  createCard,
  deleteCard,
  deleteDeck,
  generateCards,
  getDeckPath,
  getDeckCardCounts,
  listCards,
  listDecks,
  updateCard,
  suspendCard,
  unsuspendCard,
  getDeckAndAllChildren,
  formatInterval,
} from "@/store/decks";
import { ImportDialog } from "@/components/ImportDialog";
import { MoveCardsDialog } from "@/components/MoveCardsDialog";
import type { Card as CardType, Deck } from "@/lib/db";
import { Textarea } from "@/components/ui/textarea";

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

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);
  const [cards, setCards] = useState<CardType[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardCounts, setCardCounts] = useState<{
    new: number;
    learning: number;
    review: number;
  }>({ new: 0, learning: 0, review: 0 });
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [breadcrumbItems, setBreadcrumbItems] = useState<
    { label: string; href?: string }[]
  >([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  const loadDeck = async () => {
    try {
      // Normalize deckId to string
      const normalizedDeckId = String(deckId);
      const allDecks = await listDecks();
      const loadedDeck = allDecks.find((d) => d.id === normalizedDeckId);
      if (!loadedDeck) {
        router.push("/decks");
        return;
      }
      setDeck(loadedDeck);

      // Load card counts
      const counts = await getDeckCardCounts(normalizedDeckId);
      setCardCounts(counts);

      // Load breadcrumb
      const path = await getDeckPath(normalizedDeckId);
      const parts = path.split(" > ");
      const items: { label: string; href?: string }[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1) {
          const deck = allDecks.find((d) => d.name === parts[i]);
          if (deck) {
            items.push({ label: parts[i], href: `/decks/${deck.id}` });
          }
        } else {
          items.push({ label: parts[i] });
        }
      }
      setBreadcrumbItems(items);
    } catch (error) {
      console.error("Error loading deck:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCards = async () => {
    // Normalize deckId to string
    const normalizedDeckId = String(deckId);
    setLoadingCards(true);
    setCardsError(null);

    try {
      // Load cards from deck and all sub-decks
      const deckIds = await getDeckAndAllChildren(normalizedDeckId);
      const allCards: CardType[] = [];

      // Load cards from each deck
      for (const id of deckIds) {
        const deckCards = await listCards(id);
        allCards.push(...deckCards);
      }

      setCards(allCards);
    } catch (error) {
      console.error("Error loading cards:", error);
      setCardsError("Failed to load cards. Please try again.");
      setCards([]);
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    loadDeck();
    // Clear selection when deck changes
    setSelectedCardIds(new Set());
  }, [deckId, router]);

  useEffect(() => {
    if (browseMode) {
      loadCards();
    } else {
      // Clear cards when hiding
      setCards([]);
      setCardsError(null);
      setSelectedCardIds(new Set());
    }
  }, [browseMode, deckId]);

  const handleCreateCard = async () => {
    if (!front.trim() || !back.trim()) return;

    try {
      const normalizedDeckId = String(deckId);
      await createCard(normalizedDeckId, front.trim(), back.trim());
      setFront("");
      setBack("");
      setDialogOpen(false);
      await loadDeck(); // Reload counts
      if (browseMode) {
        await loadCards();
      }
    } catch (error) {
      console.error("Error creating card:", error);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm("Delete this card?")) return;

    try {
      await deleteCard(cardId);
      await loadDeck(); // Reload counts
      if (browseMode) {
        await loadCards();
      }
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const handleDeleteDeck = async () => {
    if (!confirm("Delete this deck and all its cards?")) return;

    try {
      const normalizedDeckId = String(deckId);
      await deleteDeck(normalizedDeckId);
      router.push("/decks");
    } catch (error) {
      console.error("Error deleting deck:", error);
    }
  };

  const handleEditCard = (card: CardType) => {
    setEditCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
  };

  const handleSaveEdit = async () => {
    if (!editCardId || !editFront.trim() || !editBack.trim()) return;

    try {
      await updateCard(editCardId, editFront.trim(), editBack.trim());
      setEditCardId(null);
      await loadDeck(); // Reload counts
      if (browseMode) {
        await loadCards();
      }
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  const handleSuspendCard = async (cardId: string) => {
    try {
      await suspendCard(cardId);
      await loadDeck(); // Reload counts
      if (browseMode) {
        await loadCards();
      }
    } catch (error) {
      console.error("Error suspending card:", error);
    }
  };

  const handleUnsuspendCard = async (cardId: string) => {
    try {
      await unsuspendCard(cardId);
      await loadDeck(); // Reload counts
      if (browseMode) {
        await loadCards();
      }
    } catch (error) {
      console.error("Error unsuspending card:", error);
    }
  };

  const handleImportSuccess = async () => {
    await loadDeck();
    if (browseMode) {
      await loadCards();
    }
  };

  // Selection management
  const toggleCardSelection = (cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const selectAllCards = () => {
    setSelectedCardIds(new Set(cards.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedCardIds(new Set());
  };

  const handleMoveCards = async () => {
    await loadDeck();
    await loadCards();
    clearSelection();
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!browseMode || cards.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+A / Cmd+A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedCardIds(new Set(cards.map((c) => c.id)));
      }

      // Escape: Clear selection
      if (e.key === "Escape") {
        setSelectedCardIds(new Set());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [browseMode, cards]);

  const totalCards = cardCounts.new + cardCounts.learning + cardCounts.review;
  const hasCardsToStudy = cardCounts.review > 0 || cardCounts.learning > 0 || cardCounts.new > 0;

  if (loading) {
    return (
      <>
        <Topbar title="Loading..." />
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  if (!deck) {
    return null;
  }

  // Group cards by state for Browse view
  const newCards = cards.filter((c) => c.state === "new" && !c.suspended);
  const learningCards = cards.filter(
    (c) => c.state === "learning" && !c.suspended
  );
  const reviewCards = cards.filter(
    (c) => c.state === "review" && !c.suspended && new Date(c.due_at).getTime() <= Date.now()
  );
  const suspendedCards = cards.filter((c) => c.suspended);
  const otherCards = cards.filter(
    (c) =>
      !newCards.includes(c) &&
      !learningCards.includes(c) &&
      !reviewCards.includes(c) &&
      !suspendedCards.includes(c)
  );

  return (
    <>
      <Topbar title={deck.name} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {breadcrumbItems.length > 0 && (
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
          )}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-2">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add card
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button
                variant={browseMode ? "secondary" : "outline"}
                onClick={() => setBrowseMode(!browseMode)}
              >
                <List className="mr-2 h-4 w-4" />
                {browseMode ? "Hide cards" : "Browse cards"}
              </Button>
            </div>
            <Button variant="destructive" onClick={handleDeleteDeck}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete deck
            </Button>
          </div>

          {!browseMode ? (
            // Summary view (default)
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Learning summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">
                        {cardCounts.new}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        New
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">
                        {cardCounts.learning}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Learning
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                        {cardCounts.review}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        To review
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {hasCardsToStudy ? (
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={() => router.push(`/study/${String(deckId)}`)}
                    className="min-w-[200px]"
                  >
                    <BookOpen className="mr-2 h-5 w-5" />
                    Study now
                  </Button>
                </div>
              ) : totalCards === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <p className="mb-4">No cards in this deck yet.</p>
                  <p className="text-sm">
                    Add cards or import content to get started.
                  </p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <p>All cards are up to date!</p>
                </div>
              )}
            </div>
          ) : (
            // Browse view
            <div className="space-y-6">
              {/* Selection action bar */}
              {selectedCardIds.size > 0 && (
                <div className="sticky top-0 z-10 bg-background border-b pb-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">
                        {selectedCardIds.size} selected
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllCards}
                      >
                        Select all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSelection}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setMoveDialogOpen(true)}
                      >
                        Move to...
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {loadingCards ? (
                <div className="text-center text-muted-foreground py-12">
                  <p>Loading cards...</p>
                </div>
              ) : cardsError ? (
                <div className="text-center text-destructive py-12">
                  <p>{cardsError}</p>
                  <Button
                    variant="outline"
                    onClick={loadCards}
                    className="mt-4"
                  >
                    Retry
                  </Button>
                </div>
              ) : cards.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <p className="mb-4">No cards in this deck yet.</p>
                  <p className="text-sm">
                    Add cards or import content to get started.
                  </p>
                </div>
              ) : (
                <>
                  {newCards.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">New ({newCards.length})</h3>
                      <div className="space-y-2">
                        {newCards.map((card) => (
                          <Card key={card.id} className={selectedCardIds.has(card.id) ? "ring-2 ring-primary" : ""}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedCardIds.has(card.id)}
                                    onChange={() => toggleCardSelection(card.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300"
                                  />
                                  <div>
                                    <CardTitle className="text-base">Card</CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">{getNextReviewText(card)}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCard(card)}
                                    aria-label="Edit card"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSuspendCard(card.id)}
                                    aria-label="Suspend card"
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCard(card.id)}
                                    aria-label="Delete card"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Front
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.front }}
                                />
                              </div>
                              <Separator />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Back
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.back }}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {learningCards.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">
                        Learning ({learningCards.length})
                      </h3>
                      <div className="space-y-2">
                        {learningCards.map((card) => (
                          <Card key={card.id} className={selectedCardIds.has(card.id) ? "ring-2 ring-primary" : ""}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedCardIds.has(card.id)}
                                    onChange={() => toggleCardSelection(card.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300"
                                  />
                                  <div>
                                    <CardTitle className="text-base">Card</CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">{getNextReviewText(card)}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCard(card)}
                                    aria-label="Edit card"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSuspendCard(card.id)}
                                    aria-label="Suspend card"
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCard(card.id)}
                                    aria-label="Delete card"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Front
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.front }}
                                />
                              </div>
                              <Separator />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Back
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.back }}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {reviewCards.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">
                        Review ({reviewCards.length})
                      </h3>
                      <div className="space-y-2">
                        {reviewCards.map((card) => (
                          <Card key={card.id} className={selectedCardIds.has(card.id) ? "ring-2 ring-primary" : ""}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedCardIds.has(card.id)}
                                    onChange={() => toggleCardSelection(card.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300"
                                  />
                                  <div>
                                    <CardTitle className="text-base">Card</CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">{getNextReviewText(card)}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCard(card)}
                                    aria-label="Edit card"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSuspendCard(card.id)}
                                    aria-label="Suspend card"
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCard(card.id)}
                                    aria-label="Delete card"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Front
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.front }}
                                />
                              </div>
                              <Separator />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Back
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.back }}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {suspendedCards.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">
                        Suspended ({suspendedCards.length})
                      </h3>
                      <div className="space-y-2">
                        {suspendedCards.map((card) => (
                          <Card key={card.id} className={`opacity-60 ${selectedCardIds.has(card.id) ? "ring-2 ring-primary" : ""}`}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedCardIds.has(card.id)}
                                    onChange={() => toggleCardSelection(card.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300"
                                  />
                                  <div>
                                    <CardTitle className="text-base">Card (Suspended)</CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">{getNextReviewText(card)}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCard(card)}
                                    aria-label="Edit card"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUnsuspendCard(card.id)}
                                    aria-label="Unsuspend card"
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCard(card.id)}
                                    aria-label="Delete card"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Front
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.front }}
                                />
                              </div>
                              <Separator />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Back
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.back }}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherCards.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">
                        Other ({otherCards.length})
                      </h3>
                      <div className="space-y-2">
                        {otherCards.map((card) => (
                          <Card key={card.id} className={selectedCardIds.has(card.id) ? "ring-2 ring-primary" : ""}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedCardIds.has(card.id)}
                                    onChange={() => toggleCardSelection(card.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300"
                                  />
                                  <div>
                                    <CardTitle className="text-base">Card</CardTitle>
                                    <p className="text-xs text-muted-foreground mt-1">{getNextReviewText(card)}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCard(card)}
                                    aria-label="Edit card"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSuspendCard(card.id)}
                                    aria-label="Suspend card"
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCard(card.id)}
                                    aria-label="Delete card"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Front
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.front }}
                                />
                              </div>
                              <Separator />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Back
                                </p>
                                <div
                                  className="mt-1"
                                  dangerouslySetInnerHTML={{ __html: card.back }}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create card dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New card</DialogTitle>
            <DialogDescription>
              Add a new card to this deck.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RichCardInput
              label="Front"
              value={front}
              onChange={setFront}
              placeholder="Question or front text"
            />
            <RichCardInput
              label="Back"
              value={back}
              onChange={setBack}
              placeholder="Answer or back text"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCard}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit card dialog */}
      <Dialog open={editCardId !== null} onOpenChange={(open) => !open && setEditCardId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
            <DialogDescription>
              Update the front and back of this card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCardId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialDeckId={deckId}
        onSuccess={handleImportSuccess}
      />

      <MoveCardsDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        cardIds={Array.from(selectedCardIds)}
        currentDeckId={deckId}
        onSuccess={handleMoveCards}
      />
    </>
  );
}
