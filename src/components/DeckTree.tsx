"use client";

import { useEffect, useState } from "react";
import type React from "react";
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
import { Input } from "@/components/ui/input";
import { createDeck, createCard } from "@/store/decks";
import type { DeckMode } from "@/lib/supabase-db";
import type { Deck } from "@/lib/db";
import { ChevronRight, ChevronDown, BookOpen, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DeckSettingsMenu } from "@/components/DeckSettingsMenu";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/i18n";

interface DeckTreeProps {
  deck: Deck;
  allDecks: Deck[];
  cardCounts: Record<string, number>;
  learningCounts: Record<string, { new: number; learning: number; review: number }>;
  level: number;
  expandedDeckIds: Set<string>;
  onToggleExpand: (deckId: string) => void;
  onDeckCreated: () => void;
  onDeckDeleted: () => void;
}

export function DeckTree({
  deck,
  allDecks,
  cardCounts,
  learningCounts,
  level,
  expandedDeckIds,
  onToggleExpand,
  onDeckCreated,
  onDeckDeleted,
}: DeckTreeProps) {
  const { t } = useTranslation();
  const router = useAppRouter();
  const supabase = createClient();
  const [subDeckDialogOpen, setSubDeckDialogOpen] = useState(false);
  const [subDeckName, setSubDeckName] = useState("");
  const [subDeckMode, setSubDeckMode] = useState<DeckMode>("classic");
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");

  useEffect(() => {
    router.prefetch(`/decks/${deck.id}`);
  }, [router, deck.id]);

  const children = allDecks.filter((d) => d.parent_deck_id === deck.id);
  const hasChildren = children.length > 0;
  const indent = level * 20;
  const expanded = expandedDeckIds.has(deck.id);

  const handleCreateSubDeck = async () => {
    if (!subDeckName.trim()) return;

    try {
      await createDeck(subDeckName.trim(), deck.id, subDeckMode);
      setSubDeckName("");
      setSubDeckMode("classic");
      setSubDeckDialogOpen(false);
      onDeckCreated();
    } catch (error) {
      console.error("Error creating sub-deck:", error);
    }
  };

  const handleDeckClick = () => {
    router.push(`/decks/${deck.id}`);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(deck.id);
  };

  const handleAddSubDeckClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSubDeckDialogOpen(true);
  };

  const handleCreateCard = async () => {
    if (!cardFront.trim() || !cardBack.trim()) return;

    try {
      await createCard(deck.id, cardFront.trim(), cardBack.trim(), "basic", supabase);
      setCardFront("");
      setCardBack("");
      setAddCardDialogOpen(false);
      onDeckCreated();
    } catch (error) {
      console.error("Error creating card:", error);
    }
  };

  return (
    <div>
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-foreground/[0.02] transition-colors cursor-pointer group"
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={handleDeckClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleDeckClick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Study deck: ${deck.name}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren ? (
            <button
              onClick={handleExpandClick}
              className="p-0.5 hover:bg-foreground/[0.04] rounded transition-colors flex-shrink-0"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-foreground/50" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-foreground/50" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <BookOpen className="h-4 w-4 text-foreground/40 flex-shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate">
            {deck.name}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const counts = learningCounts[deck.id] || { new: 0, learning: 0, review: 0 };
            const totalCards = cardCounts[deck.id] || 0;

            if (learningCounts[deck.id] !== undefined) {
              return (
                <div className="grid grid-cols-4 w-52 gap-3">
                  <span
                    className={`text-xs font-medium text-right whitespace-nowrap ${
                      counts.new > 0
                        ? "text-sky-600"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {counts.new}
                  </span>
                  <span
                    className={`text-xs font-medium text-right whitespace-nowrap ${
                      counts.learning > 0
                        ? "text-amber-600"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {counts.learning}
                  </span>
                  <span
                    className={`text-xs font-medium text-right whitespace-nowrap ${
                      counts.review > 0
                        ? "text-emerald-600"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {counts.review}
                  </span>
                  <span className="text-xs text-muted-foreground text-right whitespace-nowrap">
                    ({totalCards})
                  </span>
                </div>
              );
            }
            return (
              <div className="w-52 text-right">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {totalCards}
                </span>
              </div>
            );
          })()}

          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleAddSubDeckClick}
              aria-label="Add sub-deck"
              className="h-11 w-11 sm:h-7 sm:w-7 px-0 sm:px-2 text-xs hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <DeckSettingsMenu
              deckId={deck.id}
              deckName={deck.name}
              onUpdate={onDeckDeleted}
            />
          </div>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <DeckTree
              key={child.id}
              deck={child}
              allDecks={allDecks}
              cardCounts={cardCounts}
              learningCounts={learningCounts}
              level={level + 1}
              expandedDeckIds={expandedDeckIds}
              onToggleExpand={onToggleExpand}
              onDeckCreated={onDeckCreated}
              onDeckDeleted={onDeckDeleted}
            />
          ))}
        </div>
      )}

      <Dialog open={subDeckDialogOpen} onOpenChange={(open) => {
        setSubDeckDialogOpen(open);
        if (!open) {
          setSubDeckName("");
          setSubDeckMode("classic");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deckTree.newSubDeck")}</DialogTitle>
            <DialogDescription>
              {t("deckTree.newSubDeckDesc", { deckName: deck.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sub-deck-name">{t("deckTree.subDeckName")}</Label>
              <Input
                id="sub-deck-name"
                placeholder={t("deckTree.subDeckName")}
                value={subDeckName}
                onChange={(e) => setSubDeckName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateSubDeck();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-deck-mode">{t("deckTree.revisionMode")}</Label>
              <Select value={subDeckMode} onValueChange={(value: DeckMode) => setSubDeckMode(value)}>
                <SelectTrigger id="sub-deck-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">{t("deckTree.modeClassic")}</SelectItem>
                  <SelectItem value="math">{t("deckTree.modeMath")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDeckDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateSubDeck}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deckTree.newCard")}</DialogTitle>
            <DialogDescription>
              {t("deckTree.newCardDesc", { deckName: deck.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium">{t("deckTree.front")}</label>
              <Input
                placeholder={t("deckTree.questionPlaceholder")}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{t("deckTree.back")}</label>
              <Input
                placeholder={t("deckTree.answerPlaceholder")}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && cardFront.trim() && cardBack.trim()) {
                    handleCreateCard();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCardDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateCard}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
