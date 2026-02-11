"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DeckNav } from "@/components/deck/DeckNav";
import { listDecks } from "@/store/decks";
import type { Deck } from "@/lib/db";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";
import { useAppRouter } from "@/hooks/useAppRouter";

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useAppRouter();
  const isApp = useIsApp();
  const deckId = params.deckId as string;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDeck() {
      try {
        const normalizedDeckId = String(deckId);
        const allDecks = await listDecks();
        const loadedDeck = allDecks.find((d) => d.id === normalizedDeckId);

        if (!loadedDeck) {
          router.push("/decks");
          return;
        }

        setDeck(loadedDeck);
      } catch (error) {
        console.error("Error loading deck:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDeck();
  }, [deckId, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!deck) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Minimal header - just back link */}
      <div className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-10 py-4">
          <Link
            href={appHref("/decks", isApp)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Decks
          </Link>
        </div>
      </div>

      {/* Deck title - large, centered */}
      <div className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4 py-4 md:px-10 md:py-8">
          <h1 className="text-2xl md:text-3xl font-bold text-center">{deck.name}</h1>
        </div>
      </div>

      {/* Navigation tabs - centered */}
      <DeckNav deckId={deckId} />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto bg-muted/25">
        <div className="max-w-4xl mx-auto px-4 py-4 md:px-10 md:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
