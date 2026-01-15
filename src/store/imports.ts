// Import-related functions for card generation from PDFs/images
// These functions work with the imports table in Supabase

import { createClient } from "@/lib/supabase/client";

export interface CardProposal {
  front: string;
  back: string;
  confidence?: number;
  tags?: string[];
}

export interface GenerateCardsResult {
  cards: CardProposal[];
  usedFallback: boolean;
}

export interface ImportDoc {
  id: string;
  user_id: string;
  deck_id: string | null;
  filename: string;
  file_type: "pdf" | "image";
  text: string;
  page_count: number | null;
  ocr_confidence: number | null;
  created_at: string;
}

async function getCurrentUserId(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return data.user.id;
}

export async function createImport(
  deckId: string | null,
  filename: string,
  fileType: "pdf" | "image",
  text: string,
  pageCount?: number,
  ocrConfidence?: number
): Promise<ImportDoc> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("imports")
    .insert({
      user_id: userId,
      deck_id: deckId,
      filename,
      file_type: fileType,
      text: text.length > 50000 ? text.substring(0, 50000) + "...[truncated]" : text,
      page_count: pageCount ?? null,
      ocr_confidence: ocrConfidence ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ImportDoc;
}

export async function listImports(deckId: string | null): Promise<ImportDoc[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  let query = supabase
    .from("imports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (deckId !== null) {
    query = query.eq("deck_id", deckId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as ImportDoc[];
}

/**
 * Clean text: remove PDF headers, normalize whitespace, remove short lines
 */
function cleanText(text: string): string {
  let cleaned = text.replace(/^---\s*Page\s*\d+\s*---/gim, "");
  cleaned = cleaned.replace(/^---\s*Page\s*\d+\s*---/gm, "");

  const lines = cleaned
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && !line.match(/^---/));

  cleaned = lines.join(" ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Extract year from text (17xx, 18xx, 19xx, 20xx)
 */
function extractYear(text: string): string | null {
  const yearMatch = text.match(/\b(1[7-9]\d{2}|20\d{2})\b/);
  return yearMatch ? yearMatch[1] : null;
}

/**
 * Extract date from text (various formats)
 */
function extractDate(text: string): string | null {
  const datePatterns = [
    /\b(le\s+)?(\d{1,2}\s+[a-zéèê]+(?:\s+\d{4})?)\b/gi,
    /\b(en\s+)(\d{4})\b/gi,
    /\b(en\s+)([a-zéèê]+(?:\s+\d{4})?)\b/gi,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return null;
}

/**
 * Generate fallback cards locally from text using heuristic Q/A patterns
 */
function generateFallbackCards(text: string, maxCards: number = 15): CardProposal[] {
  const cleanedText = cleanText(text);

  const sentences = cleanedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 180);

  const cards: CardProposal[] = [];
  const seenFronts = new Set<string>();

  for (const sentence of sentences) {
    if (cards.length >= maxCards) break;

    let front: string | null = null;
    let back: string | null = null;

    // Pattern A: "X est Y" / "X était Y" / "X devient Y" / "X fut Y"
    const patternA = sentence.match(/^([A-ZÉÈÊÀÁÂ][^.!?]{2,50}?)\s+(est|était|devient|fut|sont|étaient|devinrent)\s+(.+?)[.!?]?$/i);
    if (patternA) {
      const [, x, , y] = patternA;
      const xClean = x.trim().replace(/,$/, "");
      const yClean = y.trim();
      if (xClean.length > 2 && yClean.length > 3) {
        front = `Qu'est-ce que ${xClean} ?`;
        back = yClean;
      }
    }

    // Pattern B: "X a lieu le DATE"
    if (!front) {
      const patternB = sentence.match(/^([A-ZÉÈÊÀÁÂ][^.!?]{2,50}?)\s+(a\s+lieu|eut\s+lieu|se\s+déroule|débute)\s+(.+?)[.!?]?$/i);
      if (patternB) {
        const [, x, , datePart] = patternB;
        const xClean = x.trim().replace(/,$/, "");
        const date = extractDate(datePart) || datePart.trim();
        if (xClean.length > 2 && date.length > 2) {
          front = `Quand a lieu ${xClean} ?`;
          back = date;
        }
      }
    }

    // Pattern C: "En 17xx/18xx/19xx/20xx, EVENT"
    if (!front) {
      const patternC = sentence.match(/^En\s+(\d{4}),\s*(.+?)[.!?]?$/i);
      if (patternC) {
        const [, year, event] = patternC;
        front = `Que se passe-t-il en ${year} ?`;
        back = event.trim();
      }
    }

    // Pattern D: "PERSONNE ... en YEAR"
    if (!front) {
      const year = extractYear(sentence);
      if (year) {
        const personMatch = sentence.match(/^([A-ZÉÈÊÀÁÂ][a-zéèêàáâ]+(?:\s+[A-ZÉÈÊÀÁÂ][a-zéèêàáâ]+){0,2})/);
        if (personMatch) {
          const person = personMatch[1].trim();
          if (person.length >= 3 && person.length <= 30) {
            front = `Quel est le lien entre ${person} et ${year} ?`;
            back = sentence;
          }
        }
      }
    }

    // Pattern E: Fallback
    if (!front) {
      const shortened = sentence.length > 90 ? sentence.substring(0, 87) + "..." : sentence;
      front = `Explique : ${shortened}`;
      back = sentence;
    }

    const frontLower = front.toLowerCase();
    if (seenFronts.has(frontLower)) {
      continue;
    }
    seenFronts.add(frontLower);

    cards.push({
      front: front.trim(),
      back: back?.trim() || sentence,
      confidence: 0.5,
    });
  }

  return cards;
}

export async function generateCards(
  importId: string,
  deckId: string,
  deckName?: string,
  maxCards: number = 20
): Promise<GenerateCardsResult> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data: importDoc, error } = await supabase
    .from("imports")
    .select("*")
    .eq("id", importId)
    .eq("user_id", userId)
    .single();

  if (error || !importDoc) {
    throw new Error("Import not found");
  }

  try {
    const response = await fetch("/api/generate-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: importDoc.text,
        deck_id: deckId,
        language: "fr",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      // For free plan users, don't fallback to heuristic cards
      if (status === 403) {
        try {
          const errorData = await response.json();
          if (errorData.error === "QUOTA_FREE_PLAN") {
            throw new Error(errorData.message || "AI generation is not available on the free plan");
          }
        } catch {
          throw new Error("AI generation is not available on the free plan");
        }
      }
      // For other errors, fallback to heuristic cards
      if (status === 401 || status === 429 || status >= 500) {
        const fallbackCards = generateFallbackCards(importDoc.text, maxCards);
        return { cards: fallbackCards, usedFallback: true };
      }

      try {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || "Failed to generate cards");
      } catch {
        throw new Error(`HTTP ${status}: Failed to generate cards`);
      }
    }

    const data = await response.json();
    return { cards: data.cards || [], usedFallback: false };
  } catch (err) {
    // Re-throw if it's a free plan error (already handled above)
    if (err instanceof Error && err.message.includes("free plan")) {
      throw err;
    }
    // For network errors, fallback to heuristic cards
    if (err instanceof TypeError || err instanceof Error) {
      const fallbackCards = generateFallbackCards(importDoc.text, maxCards);
      return { cards: fallbackCards, usedFallback: true };
    }
    throw err;
  }
}

export async function persistGeneratedCards(
  importId: string,
  deckId: string,
  selectedCards: CardProposal[]
): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Insert cards
  const cardsToInsert = selectedCards.map((proposal) => ({
    user_id: userId,
    deck_id: deckId,
    front: proposal.front,
    back: proposal.back,
    state: "new" as const,
    suspended: false,
    interval_days: 0,
    ease: 2.50,
    reps: 0,
    lapses: 0,
    learning_step_index: 0,
    due_at: new Date().toISOString(),
  }));

  const { error: cardsError } = await supabase
    .from("cards")
    .insert(cardsToInsert);

  if (cardsError) throw cardsError;

  // Insert generated_cards records
  const generatedToInsert = selectedCards.map((proposal) => ({
    user_id: userId,
    import_id: importId,
    deck_id: deckId,
    front: proposal.front,
    back: proposal.back,
  }));

  const { error: genError } = await supabase
    .from("generated_cards")
    .insert(generatedToInsert);

  if (genError) throw genError;

  // Update deck's updated_at
  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("user_id", userId);
}
