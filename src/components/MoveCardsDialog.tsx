"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listDecksWithPaths, moveCardsToDeck } from "@/store/decks";
import type { Deck } from "@/lib/db";
import { useTranslation } from "@/i18n";

interface MoveCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardIds: string[];
  currentDeckId: string;
  onSuccess: () => void;
}

export function MoveCardsDialog({
  open,
  onOpenChange,
  cardIds,
  currentDeckId,
  onSuccess,
}: MoveCardsDialogProps) {
  const { t } = useTranslation();
  const [decksWithPaths, setDecksWithPaths] = useState<
    Array<{ deck: Deck; path: string }>
  >([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadDecks();
      setSelectedDeckId("");
      setError(null);
    }
  }, [open]);

  const loadDecks = async () => {
    try {
      const decks = await listDecksWithPaths();
      const filtered = decks.filter((d) => d.deck.id !== currentDeckId);
      const usableDecks = filtered.length > 0 ? filtered : decks;
      setDecksWithPaths(usableDecks);
      setSelectedDeckId((prev) =>
        usableDecks.some((d) => d.deck.id === prev) ? prev : ""
      );
    } catch (err) {
      console.error("Error loading decks:", err);
      setError(t("moveCards.failedToLoad"));
    }
  };

  const handleMove = async () => {
    if (!selectedDeckId) {
      setError(t("moveCards.pleaseSelectDeck"));
      return;
    }

    if (cardIds.length === 0) {
      setError(t("moveCards.noCardsSelected"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await moveCardsToDeck(cardIds, selectedDeckId);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Error moving cards:", err);
      setError(t("moveCards.failedToMove"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moveCards.title")}</DialogTitle>
          <DialogDescription>
            {t("moveCards.moveCount", { count: cardIds.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="targetDeck">{t("moveCards.selectDeck")}</Label>
            <Select
              value={selectedDeckId || undefined}
              onValueChange={(value) => {
                setSelectedDeckId(value);
                if (error) setError(null);
              }}
              disabled={loading}
            >
              <SelectTrigger id="targetDeck">
                <SelectValue placeholder={t("moveCards.selectDeckPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {decksWithPaths.map(({ deck, path }) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleMove} disabled={loading || !selectedDeckId}>
            {loading ? t("moveCards.moving") : t("moveCards.move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
