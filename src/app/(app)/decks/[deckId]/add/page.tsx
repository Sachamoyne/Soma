"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichCardInput } from "@/components/RichCardInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload } from "lucide-react";
import { createCard, invalidateDeckCaches, invalidateCardCaches } from "@/store/decks";
import { createClient } from "@/lib/supabase/client";
import { CARD_TYPES, type CardType as CardTypeEnum } from "@/lib/card-types";
import { ImportDialog } from "@/components/ImportDialog";

export default function AddCardsPage() {
  const params = useParams();
  const supabase = createClient();
  const deckId = params.deckId as string;

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [cardType, setCardType] = useState<CardTypeEnum>("basic");
  const [creating, setCreating] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreateCard = async () => {
    if (!front.trim() || !back.trim()) {
      return;
    }

    setCreating(true);
    setSuccessMessage(null);

    try {
      const normalizedDeckId = String(deckId);
      await createCard(normalizedDeckId, front.trim(), back.trim(), cardType, supabase);

      // Clear form
      setFront("");
      setBack("");

      // Show success message
      setSuccessMessage("Card created successfully!");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error creating card:", error);
      alert("Failed to create card. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to create card
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleCreateCard();
    }
  };

  const handleImportSuccess = () => {
    invalidateDeckCaches();
    invalidateCardCaches();
    setImportDialogOpen(false);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Add Cards</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create new flashcards for this deck
            </p>
          </div>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import from File
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Success message */}
            {successMessage && (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-800 dark:text-green-200">
                {successMessage}
              </div>
            )}

            {/* Card type selector */}
            <div>
              <label className="mb-2 block text-sm font-medium">Card Type</label>
              <Select
                value={cardType}
                onValueChange={(value) => setCardType(value as CardTypeEnum)}
              >
                <SelectTrigger className="h-11 w-full rounded-lg border border-border bg-background px-4 shadow-sm flex items-center justify-between text-sm text-foreground hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue className="leading-none text-sm" />
                </SelectTrigger>
                <SelectContent>
                  {CARD_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {type.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Front field */}
            <RichCardInput
              label="Front"
              value={front}
              onChange={setFront}
              onKeyDown={handleKeyDown}
              placeholder="Enter the question or front side of the card"
            />

            {/* Back field */}
            <RichCardInput
              label="Back"
              value={back}
              onChange={setBack}
              onKeyDown={handleKeyDown}
              placeholder="Enter the answer or back side of the card"
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">Cmd+Enter</kbd> to add card
              </p>
              <Button
                onClick={handleCreateCard}
                disabled={!front.trim() || !back.trim() || creating}
              >
                <Plus className="mr-2 h-4 w-4" />
                {creating ? "Adding..." : "Add Card"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick tips */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">Tips for creating good flashcards:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Keep cards simple and focused on one concept</li>
              <li>Use clear, concise language</li>
              <li>Add context when necessary</li>
              <li>Use images or formatting to make cards memorable</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Import dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialDeckId={deckId}
        onSuccess={handleImportSuccess}
      />
    </>
  );
}
