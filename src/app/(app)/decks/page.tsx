"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
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
import { listDecks, createDeck, getAnkiCountsForDecks } from "@/store/decks";
import { ImportDialog } from "@/components/ImportDialog";
import type { Deck } from "@/lib/db";
import { BookOpen } from "lucide-react";

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [learningCounts, setLearningCounts] = useState<
    Record<string, { new: number; learning: number; review: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [expandedDeckIds, setExpandedDeckIds] = useState<Set<string>>(new Set());

  const loadDecks = async () => {
    try {
      const loadedDecks = await listDecks();
      setDecks(loadedDecks);

      const deckIds = loadedDecks.map((d) => d.id);
      if (deckIds.length === 0) {
        setCardCounts({});
        setLearningCounts({});
        return;
      }

      const results = await Promise.all(
        deckIds.map(async (deckId) => ({
          deckId,
          result: await getAnkiCountsForDecks([deckId]),
        }))
      );

      const nextTotals: Record<string, number> = {};
      const nextDue: Record<string, { new: number; learning: number; review: number }> = {};

      for (const { deckId, result } of results) {
        nextTotals[deckId] = result.total[deckId] || 0;
        nextDue[deckId] = result.due[deckId] || { new: 0, learning: 0, review: 0 };
      }

      setCardCounts(nextTotals);
      setLearningCounts(nextDue);
    } catch (error) {
      console.error("❌ Error loading decks:", error);
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
    window.addEventListener("synapse-counts-updated", handleCountsUpdated);
    return () => {
      window.removeEventListener("synapse-counts-updated", handleCountsUpdated);
    };
  }, []);

  const handleCreateDeck = async () => {
    if (!deckName.trim()) return;

    try {
      await createDeck(deckName.trim());
      await loadDecks();
      setDeckName("");
      setDialogOpen(false);
    } catch (error) {
      console.error("❌ Error creating deck:", error);
      alert("Error creating deck: " + (error as Error).message);
    }
  };

  const handleImportSuccess = async () => {
    await loadDecks();
  };

  const rootDecks = decks.filter((d) => !d.parent_deck_id);

  return (
    <>
      <Topbar
        title="Decks"
        showNewDeck
        onNewDeck={() => setDialogOpen(true)}
        showImport
        onImport={() => setImportDialogOpen(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-10 py-8">
          {loading ? (
            <div className="rounded-2xl bg-white px-8 py-14 text-center shadow-sm">
              <p className="text-slate-500">Loading decks...</p>
            </div>
          ) : rootDecks.length === 0 ? (
            <div className="rounded-2xl bg-white px-8 py-14 text-center shadow-sm">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No decks yet
              </h3>
              <p className="text-slate-500 mb-6">
                Create your first deck to start learning
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                Create your first deck
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white overflow-hidden shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50/70 border-b border-slate-200">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Deck
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedDeckIds(new Set())}
                    className="h-7 px-2 text-xs"
                  >
                    Collapse all
                  </Button>

                  <div className="grid grid-cols-4 w-52 gap-3">
                    <span className="text-xs text-right">New</span>
                    <span className="text-xs text-right">Learning</span>
                    <span className="text-xs text-right">Review</span>
                    <span className="text-xs text-right">Total</span>
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
          )}
        </div>
      </div>

      {/* New deck dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New deck</DialogTitle>
            <DialogDescription>
              Create a new deck to organize your cards.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Deck name"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateDeck()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDeck}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialDeckId={null}
        onSuccess={handleImportSuccess}
      />
    </>
  );
}
