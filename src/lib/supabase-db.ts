import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type Deck = Database["public"]["Tables"]["decks"]["Row"];
export type Card = Database["public"]["Tables"]["cards"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type ImportDoc = Database["public"]["Tables"]["imports"]["Row"];
export type GeneratedCard = Database["public"]["Tables"]["generated_cards"]["Row"];
export type Settings = Database["public"]["Tables"]["settings"]["Row"];

// Re-export scheduler functions for convenience
export { previewIntervals, formatInterval, formatIntervalDays, parseSteps } from "./scheduler";
export type { IntervalPreview, SchedulerSettings } from "./scheduler";

const DECKS_CACHE_TTL_MS = 30_000;
const CARDS_CACHE_TTL_MS = 20_000;

let decksCache: { data: Deck[]; ts: number } | null = null;
let decksWithPathsCache: { data: Array<{ deck: Deck; path: string }>; ts: number } | null = null;
let allCardsCache: { data: Card[]; ts: number } | null = null;
let allDeckCountsCache: {
  data: {
    cardCounts: Record<string, number>;
    dueCounts: Record<string, number>;
    learningCounts: Record<string, { new: number; learning: number; review: number }>;
  };
  ts: number;
} | null = null;
const ankiCountsCache = new Map<string, { data: { due: Record<string, { new: number; learning: number; review: number }>; total: Record<string, number> }; ts: number }>();
const deckCardsCache = new Map<string, { data: Card[]; ts: number }>();

function isCacheFresh(ts: number, ttlMs: number): boolean {
  return Date.now() - ts < ttlMs;
}

export function invalidateDeckCaches(): void {
  decksCache = null;
  decksWithPathsCache = null;
  allDeckCountsCache = null;
}

export function invalidateCardCaches(): void {
  allCardsCache = null;
  allDeckCountsCache = null;
  ankiCountsCache.clear();
  deckCardsCache.clear();
}

function buildDeckPathMap(decks: Deck[]): Map<string, string> {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const memo = new Map<string, string>();

  const buildPath = (deckId: string): string => {
    if (memo.has(deckId)) return memo.get(deckId)!;
    const deck = deckById.get(deckId);
    if (!deck) return "";
    if (!deck.parent_deck_id) {
      memo.set(deckId, deck.name);
      return deck.name;
    }
    const parentPath = buildPath(deck.parent_deck_id);
    const path = parentPath ? `${parentPath}::${deck.name}` : deck.name;
    memo.set(deckId, path);
    return path;
  };

  for (const deck of decks) {
    buildPath(deck.id);
  }

  return memo;
}

// Get current user ID
async function getCurrentUserId(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return data.user.id;
}

// Deck functions
export async function listDecks(): Promise<Deck[]> {
  if (decksCache && isCacheFresh(decksCache.ts, DECKS_CACHE_TTL_MS)) {
    return decksCache.data;
  }

  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id, name, parent_deck_id, mode, config, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const result = data || [];
  decksCache = { data: result, ts: Date.now() };
  return result;
}

export type DeckMode = "classic" | "math" | "languages" | "humanities";

/** Vocabulary direction for languages mode */
export type VocabDirection = "normal" | "reversed" | "both";

/** Configuration for languages mode decks */
export interface LanguagesConfig {
  sourceLanguage: string;
  targetLanguage: string;
  vocabDirection: VocabDirection;
}

/** Deck configuration (mode-specific settings stored in config JSONB) */
export type DeckConfig = LanguagesConfig | null;

export async function createDeck(
  name: string,
  parentDeckId?: string | null,
  mode: DeckMode = "classic",
  config?: DeckConfig
): Promise<Deck> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const insertData: any = {
    user_id: userId,
    name,
    mode,
  };

  if (parentDeckId) {
    insertData.parent_deck_id = parentDeckId;
  }

  // Add config for modes that require it (e.g., languages)
  if (config) {
    insertData.config = config;
  }

  const { data, error } = await supabase
    .from("decks")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  invalidateDeckCaches();
  return data;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("decks")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateDeckCaches();
}

export async function deleteDeck(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Get all descendant deck IDs
  const descendantIds = await getDeckAndAllChildren(id);

  // Delete all cards from all descendant decks
  const { error: cardsError } = await supabase
    .from("cards")
    .delete()
    .in("deck_id", descendantIds)
    .eq("user_id", userId);

  if (cardsError) throw cardsError;

  // Delete all descendant decks
  const { error: decksError } = await supabase
    .from("decks")
    .delete()
    .in("id", descendantIds)
    .eq("user_id", userId);

  if (decksError) throw decksError;
  invalidateDeckCaches();
  invalidateCardCaches();
}

export async function getDeckAndAllChildren(deckId: string): Promise<string[]> {
  const allDecks = await listDecks();
  const childrenByParent = new Map<string, string[]>();
  for (const deck of allDecks) {
    if (deck.parent_deck_id) {
      const list = childrenByParent.get(deck.parent_deck_id) || [];
      list.push(deck.id);
      childrenByParent.set(deck.parent_deck_id, list);
    }
  }

  const result: string[] = [deckId];
  const toProcess = [deckId];

  while (toProcess.length > 0) {
    const currentDeckId = toProcess.pop()!;
    const children = childrenByParent.get(currentDeckId) || [];
    for (const childId of children) {
      result.push(childId);
      toProcess.push(childId);
    }
  }

  return result;
}

export async function getDeckPath(deckId: string): Promise<string> {
  const allDecks = await listDecks();
  const pathMap = buildDeckPathMap(allDecks);
  return pathMap.get(deckId) || "";
}

export async function listDecksWithPaths(): Promise<Array<{ deck: Deck; path: string }>> {
  if (decksWithPathsCache && isCacheFresh(decksWithPathsCache.ts, DECKS_CACHE_TTL_MS)) {
    return decksWithPathsCache.data;
  }

  const allDecks = await listDecks();
  const pathMap = buildDeckPathMap(allDecks);
  const decksWithPaths = allDecks.map((deck) => ({
    deck,
    path: pathMap.get(deck.id) || deck.name,
  }));
  const sorted = decksWithPaths.sort((a, b) => a.path.localeCompare(b.path));
  decksWithPathsCache = { data: sorted, ts: Date.now() };
  return sorted;
}

// Card functions
export async function listCards(deckId: string): Promise<Card[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("deck_id", deckId)
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

export async function listCardsForDeckTree(deckId: string): Promise<Card[]> {
  const cached = deckCardsCache.get(deckId);
  if (cached && isCacheFresh(cached.ts, CARDS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const supabase = createClient();
  const userId = await getCurrentUserId();
  const deckIds = await getDeckAndAllChildren(deckId);

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .in("deck_id", deckIds)
    .eq("user_id", userId);

  if (error) throw error;
  const result = data || [];
  deckCardsCache.set(deckId, { data: result, ts: Date.now() });
  return result;
}

export async function listAllCards(): Promise<Card[]> {
  if (allCardsCache && isCacheFresh(allCardsCache.ts, CARDS_CACHE_TTL_MS)) {
    return allCardsCache.data;
  }

  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;
  const result = data || [];
  allCardsCache = { data: result, ts: Date.now() };
  return result;
}

export async function setCardDueDate(cardId: string, dueAtIso: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("cards")
    .update({
      due_at: dueAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cardId)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();
}

export async function forgetCard(cardId: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("cards")
    .update({
      state: "new",
      due_at: nowIso,
      interval_days: 0,
      ease: 2.50,
      reps: 0,
      lapses: 0,
      learning_step_index: 0,
      last_reviewed_at: null,
      updated_at: nowIso,
    })
    .eq("id", cardId)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();
}

export async function setCardMarked(cardId: string, marked: boolean): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("extra")
    .eq("id", cardId)
    .eq("user_id", userId)
    .single();

  if (fetchError) throw fetchError;

  const nextExtra = { ...(card?.extra || {}), marked };

  const { error } = await supabase
    .from("cards")
    .update({ extra: nextExtra, updated_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();
}

export async function createCard(
  deckId: string,
  front: string,
  back: string,
  type: "basic" | "reversible" | "typed" | "definition" | "property" | "formula" | "vocabulary" | "grammar_rule" | "philosophy_concept" = "basic",
  supabase: SupabaseClient,
  extra?: Record<string, unknown> | null
): Promise<Card> {
  // Sanitize inputs
  const sanitizedFront = `${front ?? ""}`.trim();
  const sanitizedBack = `${back ?? ""}`.trim();
  const normalizedType = type || "basic";

  console.log("[createCard] 🚀 START", {
    deckId,
    frontLength: sanitizedFront.length,
    backLength: sanitizedBack.length,
    type: normalizedType,
  });

  if (!sanitizedFront || !sanitizedBack) {
    console.error("[createCard] ❌ Missing required fields");
    throw new Error("Front and back are required to create a card");
  }

  // Get session - using getSession() which verifies JWT validity
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  console.log("[createCard] 🔐 Session check", {
    hasSession: !!session,
    userId: session?.user?.id,
    sessionExpiresAt: session?.expires_at,
    hasError: !!sessionError,
  });

  if (sessionError) {
    console.error("[createCard] ❌ Session error:", sessionError.message);
    throw new Error(`Authentication error: ${sessionError.message}`);
  }

  if (!session?.user?.id) {
    console.error("[createCard] ❌ No valid session");
    throw new Error("Not authenticated - please log in again");
  }

  const userId = session.user.id;

  const nowIso = new Date().toISOString();

  // Build base payload with ALL required fields explicitly to avoid any DEFAULT issues
  const basePayload = {
    user_id: userId,
    deck_id: deckId,
    state: "new" as const,
    suspended: false,
    interval_days: 0,
    ease: 2.50,
    reps: 0,
    lapses: 0,
    learning_step_index: 0,
    due_at: nowIso,
  };

  const isReversible = normalizedType === "reversible";
  const payload1 = {
    ...basePayload,
    front: sanitizedFront,
    back: sanitizedBack,
    type: isReversible ? ("basic" as const) : normalizedType,
    ...(extra ? { extra } : {}),
  };
  const payload2 = isReversible
    ? {
        ...basePayload,
        front: sanitizedBack,
        back: sanitizedFront,
        type: "basic" as const,
      }
    : null;
  const payloads = payload2 ? [payload1, payload2] : [payload1];

  if (!payload1.front || !payload1.back) {
    throw new Error("Card creation failed: payload1 missing front/back");
  }
  if (payload2 && (!payload2.front || !payload2.back)) {
    throw new Error("Card creation failed: payload2 missing front/back");
  }

  console.log("[createCard] 📤 Attempting INSERT with payload:", {
    user_id: basePayload.user_id,
    deck_id: basePayload.deck_id,
    type: normalizedType,
    state: basePayload.state,
    suspended: basePayload.suspended,
    interval_days: basePayload.interval_days,
    ease: basePayload.ease,
    reps: basePayload.reps,
    lapses: basePayload.lapses,
    learning_step_index: basePayload.learning_step_index,
    frontLength: sanitizedFront.length,
    backLength: sanitizedBack.length,
    due_at: basePayload.due_at,
    rowCount: payloads.length,
  });

  // DEBUG: Log full payload for property cards
  console.log("[createCard] 📦 Full payload1:", JSON.stringify(payload1, null, 2));
  if (extra) {
    console.log("[createCard] 📦 Extra field:", JSON.stringify(extra, null, 2));
  }

  const { data, error } = await supabase
    .from("cards")
    .insert(payloads)
    .select();

  console.log("[createCard] 📥 INSERT response received");

  // EXHAUSTIVE ERROR LOGGING - Log each property separately so they show in console
  if (error) {
    console.error("[createCard] ❌ ❌ ❌ INSERT FAILED ❌ ❌ ❌");
    console.error("=".repeat(60));
    console.error("Error message:", error.message || "(empty string)");
    console.error("Error code:", error.code || "(no code)");
    console.error("Error details:", error.details || "(no details)");
    console.error("Error hint:", error.hint || "(no hint)");
    console.error("Error status:", (error as any).status || "(no status)");
    console.error("Error statusCode:", (error as any).statusCode || "(no statusCode)");
    console.error("Error name:", error.name || "(no name)");
    console.error("-".repeat(60));
    console.error("Full error object as JSON:");
    console.error(JSON.stringify(error, null, 2));
    console.error("-".repeat(60));
    console.error("Error object keys:", Object.keys(error));
    console.error("Error constructor:", error.constructor.name);

    // Check for nested errors
    if ((error as any).error) {
      console.error("Nested error found:", (error as any).error);
    }

    // Log the type of each property
    console.error("-".repeat(60));
    console.error("Property types:");
    Object.keys(error).forEach(key => {
      console.error(`  ${key}: ${typeof (error as any)[key]} = ${(error as any)[key]}`);
    });
    console.error("=".repeat(60));

    // Specific error handling
    const errorMsg = error.message || "";

    if (!errorMsg || errorMsg === "") {
      throw new Error(
        "Card creation blocked by RLS policy or database constraint. " +
        "Check the console for the full error object above. " +
        "Try refreshing the page or logging out and back in."
      );
    }

    if (errorMsg.includes("violates")) {
      throw new Error(`Database constraint violated: ${errorMsg}`);
    }

    if (errorMsg.includes("permission") || errorMsg.includes("policy")) {
      throw new Error(`Permission denied by RLS policy: ${errorMsg}`);
    }

    if (errorMsg.includes("Load failed") || errorMsg.includes("network") || errorMsg.includes("TypeError")) {
      throw new Error(
        `Network error: ${errorMsg}. Please check your internet connection and try again.`
      );
    }

    throw new Error(`Card creation failed: ${errorMsg}`);
  }

  if (!data || data.length === 0) {
    console.error("[createCard] ❌ INSERT succeeded but no data returned");
    throw new Error("Card created but no data returned - please refresh the page");
  }

  const primaryCard =
    data.find((card) => card.front === sanitizedFront && card.back === sanitizedBack) ??
    data[0];

  console.log("[createCard] ✅ ✅ ✅ SUCCESS ✅ ✅ ✅", {
    cardId: primaryCard.id,
    deckId: primaryCard.deck_id,
    state: primaryCard.state,
    type: primaryCard.type,
    rowCount: data.length,
  });

  // Update deck's updated_at timestamp (non-critical operation)
  try {
    await supabase
      .from("decks")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("user_id", userId);
  } catch (deckUpdateError) {
    console.warn("[createCard] ⚠️ Failed to update deck timestamp (non-critical):", deckUpdateError);
  }

  invalidateCardCaches();
  return primaryCard;
}

export async function deleteCard(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Get the card to find its deck_id
  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("deck_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("cards")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();

  // Update deck's updated_at
  if (card) {
    await supabase
      .from("decks")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", card.deck_id)
      .eq("user_id", userId);
  }
}

export async function updateCard(
  id: string,
  front: string,
  back: string,
  type?: "basic" | "reversible" | "typed" | "definition" | "property" | "formula" | "vocabulary" | "grammar_rule" | "philosophy_concept"
): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Get the card to find its deck_id
  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("deck_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (fetchError) throw fetchError;

  const updateData: any = {
    front,
    back,
    updated_at: new Date().toISOString(),
  };

  // Only update type if provided
  if (type !== undefined) {
    updateData.type = type;
  }

  const { error } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();

  // Update deck's updated_at
  if (card) {
    await supabase
      .from("decks")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", card.deck_id)
      .eq("user_id", userId);
  }
}

export async function suspendCard(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("cards")
    .update({
      suspended: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();
}

export async function unsuspendCard(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("cards")
    .update({
      suspended: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();
}

export async function moveCardsToDeck(
  cardIds: string[],
  targetDeckId: string
): Promise<void> {
  if (!targetDeckId || cardIds.length === 0) return;

  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("cards")
    .update({
      deck_id: targetDeckId,
      updated_at: new Date().toISOString(),
    })
    .in("id", cardIds)
    .eq("user_id", userId);

  if (error) throw error;
  invalidateCardCaches();

  // Update deck's updated_at
  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", targetDeckId)
    .eq("user_id", userId);
}

// SRS Functions
/**
 * Get due cards for study, prioritized according to Anki rules:
 * 1. Learning/Relearning cards (by due time)
 * 2. Review cards (by due time)
 * 3. New cards (up to new_cards_per_day limit)
 *
 * This ensures Anki behavior where learning cards appear first.
 *
 * IMPORTANT: Uses EFFECTIVE settings (deck overrides → global fallback)
 * to respect per-deck limits when configured.
 */
export async function getDueCards(
  deckId: string,
  limit: number = 50
): Promise<Card[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  const nowDate = new Date();
  nowDate.setMilliseconds(0);
  const now = nowDate.toISOString();

  // Get all descendant deck IDs
  const deckIds = await getDeckAndAllChildren(deckId);

  // ✅ CRITICAL FIX: Get EFFECTIVE settings for this deck
  // This resolves: deck overrides → global settings (if null)
  // Import is at the bottom to avoid circular dependency
  const { getEffectiveDeckSettings } = await import("../store/deck-settings");
  const settings = await getEffectiveDeckSettings(deckId);

  console.log("🎯 getDueCards - Using Effective Settings:", {
    deckId,
    newCardsPerDay: settings.newCardsPerDay,
    maxReviewsPerDay: settings.maxReviewsPerDay,
  });

  // Count how many cards were studied today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Count new cards studied today
  const { count: newCardsToday } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("deck_id", deckIds)
    .eq("previous_state", "new")
    .gte("reviewed_at", todayStart.toISOString());

  // Count review cards studied today (not counting learning/relearning)
  const { count: reviewCardsToday } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("deck_id", deckIds)
    .eq("previous_state", "review")
    .gte("reviewed_at", todayStart.toISOString());

  // Calculate remaining quota for today
  const newCardsAllowed = Math.max(0, (settings.newCardsPerDay || 20) - (newCardsToday || 0));
  const reviewCardsAllowed = Math.max(0, (settings.maxReviewsPerDay || 9999) - (reviewCardsToday || 0));

  console.log("🎯 getDueCards - Daily Quotas:", {
    newCardsStudiedToday: newCardsToday,
    reviewCardsStudiedToday: reviewCardsToday,
    newCardsAllowed,
    reviewCardsAllowed,
  });

  // 1. Get learning/relearning cards (priority 1)
  const { data: learningCards, error: learningError } = await supabase
    .from("cards")
    .select("*")
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false)
    .in("state", ["learning", "relearning"])
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(limit);

  if (learningError) throw learningError;
  const learning = learningCards || [];

  // 2. Get review cards (priority 2, respecting daily quota)
  const remainingLimit = Math.max(0, limit - learning.length);
  const reviewLimit = Math.min(remainingLimit, reviewCardsAllowed);

  let reviews: Card[] = [];
  if (reviewLimit > 0) {
    const { data: reviewCards, error: reviewError } = await supabase
      .from("cards")
      .select("*")
      .in("deck_id", deckIds)
      .eq("user_id", userId)
      .eq("suspended", false)
      .eq("state", "review")
      .lte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(reviewLimit);

    if (reviewError) throw reviewError;
    reviews = reviewCards || [];
  }

  // 3. Get new cards (priority 3, respecting quota)
  const newCardsLimit = Math.min(
    Math.max(0, limit - learning.length - reviews.length),
    newCardsAllowed
  );

  let newCards: Card[] = [];
  if (newCardsLimit > 0) {
    const { data: newCardsData, error: newError } = await supabase
      .from("cards")
      .select("*")
      .in("deck_id", deckIds)
      .eq("user_id", userId)
      .eq("suspended", false)
      .eq("state", "new")
      .lte("due_at", now)
      .order("created_at", { ascending: true }) // Anki behavior: oldest first
      .limit(newCardsLimit);

    if (newError) throw newError;
    newCards = newCardsData || [];
  }

  if (settings.reviewOrder === "newFirst") {
    return [...learning, ...newCards, ...reviews];
  }

  if (settings.reviewOrder === "mixed") {
    const mixed: Card[] = [];
    let reviewIndex = 0;
    let newIndex = 0;
    while (reviewIndex < reviews.length || newIndex < newCards.length) {
      if (newIndex < newCards.length) {
        mixed.push(newCards[newIndex]);
        newIndex += 1;
      }
      if (reviewIndex < reviews.length) {
        mixed.push(reviews[reviewIndex]);
        reviewIndex += 1;
      }
    }
    return [...learning, ...mixed];
  }

  // Default: reviews before new
  return [...learning, ...reviews, ...newCards];
}

export async function getDueCount(deckId: string): Promise<number> {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  // Get all descendant deck IDs
  const deckIds = await getDeckAndAllChildren(deckId);

  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false)
    .lte("due_at", now);

  if (error) throw error;
  return count || 0;
}

export async function getTotalCardCount(deckId: string): Promise<number> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Get all descendant deck IDs
  const deckIds = await getDeckAndAllChildren(deckId);

  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false);

  if (error) throw error;
  return count || 0;
}

export async function getDeckCardCounts(deckId: string): Promise<{
  new: number;
  learning: number;
  review: number;
}> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Get all descendant deck IDs
  const deckIds = await getDeckAndAllChildren(deckId);

  const { data, error } = await supabase
    .from("cards")
    .select("state")
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false);

  if (error) throw error;

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;

  for (const card of data || []) {
    if (card.state === "new") {
      newCount++;
    } else if (card.state === "learning" || card.state === "relearning") {
      learningCount++;
    } else if (card.state === "review") {
      reviewCount++;
    }
  }

  return { new: newCount, learning: learningCount, review: reviewCount };
}

/**
 * OPTIMIZED: Get all deck counts in a single batch query
 * This replaces the N+1 query pattern of calling getTotalCardCount, getDueCount,
 * and getDeckCardCounts for each deck individually.
 *
 * Performance improvement: O(n) -> O(1) database queries
 */
export async function getAllDeckCounts(deckIds: string[]): Promise<{
  cardCounts: Record<string, number>;
  dueCounts: Record<string, number>;
  learningCounts: Record<string, { new: number; learning: number; review: number }>;
}> {
  if (allDeckCountsCache && isCacheFresh(allDeckCountsCache.ts, CARDS_CACHE_TTL_MS)) {
    return allDeckCountsCache.data;
  }

  const supabase = createClient();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  // Single query to fetch all cards for all decks
  const { data: allCards, error } = await supabase
    .from("cards")
    .select("deck_id, state, due_at, suspended")
    .eq("user_id", userId);

  if (error) throw error;

  // Build a map of deck -> all descendant deck IDs (including self)
  const { data: allDecks } = await supabase
    .from("decks")
    .select("id, parent_deck_id")
    .eq("user_id", userId);

  const deckHierarchy = new Map<string, string[]>();

  // Helper to get all descendants recursively
  const getAllDescendants = (deckId: string): string[] => {
    if (deckHierarchy.has(deckId)) {
      return deckHierarchy.get(deckId)!;
    }

    const children = (allDecks || []).filter(d => d.parent_deck_id === deckId);
    const descendants = [deckId]; // Include self

    for (const child of children) {
      descendants.push(...getAllDescendants(child.id));
    }

    deckHierarchy.set(deckId, descendants);
    return descendants;
  };

  // Pre-compute descendants for all requested decks
  for (const deckId of deckIds) {
    getAllDescendants(deckId);
  }

  // Initialize result objects
  const cardCounts: Record<string, number> = {};
  const dueCounts: Record<string, number> = {};
  const learningCounts: Record<string, { new: number; learning: number; review: number }> = {};

  // Calculate counts for each deck
  for (const deckId of deckIds) {
    const descendantIds = deckHierarchy.get(deckId) || [deckId];

    // Filter cards belonging to this deck or its descendants
    const deckCards = (allCards || []).filter(
      card => descendantIds.includes(card.deck_id) && !card.suspended
    );

    // Total card count
    cardCounts[deckId] = deckCards.length;

    // Due count
    dueCounts[deckId] = deckCards.filter(card => card.due_at <= now).length;

    // Learning counts (new, learning, review) - only due cards
    const counts = { new: 0, learning: 0, review: 0 };
    for (const card of deckCards) {
      if (card.due_at <= now) {
        if (card.state === "new") counts.new++;
        else if (card.state === "review") counts.review++;
        else if (card.state === "learning" || card.state === "relearning") counts.learning++;
      }
    }
    learningCounts[deckId] = counts;
  }

  const result = { cardCounts, dueCounts, learningCounts };
  allDeckCountsCache = { data: result, ts: Date.now() };
  return result;
}

export async function getAnkiCountsForDecks(deckIds: string[]): Promise<{
  due: Record<string, { new: number; learning: number; review: number }>;
  total: Record<string, number>;
}> {
  const cacheKey = [...deckIds].sort().join("|");
  const cached = ankiCountsCache.get(cacheKey);
  if (cached && isCacheFresh(cached.ts, CARDS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_deck_anki_counts", {
    deck_ids: deckIds,
  });

  if (error) throw error;

  const due: Record<string, { new: number; learning: number; review: number }> = {};
  const total: Record<string, number> = {};

  for (const row of data || []) {
    due[row.deck_id] = {
      new: row.new_due ?? 0,
      learning: row.learning_due ?? 0,
      review: row.review_due ?? 0,
    };
    total[row.deck_id] = row.total_cards ?? 0;
  }

  const result = { due, total };
  ankiCountsCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

export async function reviewCard(
  cardId: string,
  rating: "again" | "hard" | "good" | "easy",
  elapsedMs?: number
): Promise<Card> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  console.log("🔷 reviewCard START", { cardId, rating, userId });

  // Get the card
  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !card) {
    console.error("❌ Card fetch error:", fetchError);
    throw new Error("Card not found");
  }

  console.log("📋 Current card state:", {
    state: card.state,
    interval_days: card.interval_days,
    ease: card.ease,
    reps: card.reps,
    learning_step_index: card.learning_step_index,
  });

  // Get settings
  const settings = await getSettings();

  console.log("⚙️ Settings loaded:", {
    starting_ease: settings.starting_ease,
    easy_bonus: settings.easy_bonus,
    hard_interval: settings.hard_interval,
  });

  // Import scheduler
  const { gradeCard } = await import("./scheduler");

  // Prepare scheduler settings
  const schedulerSettings = {
    starting_ease: settings.starting_ease || 2.5,
    easy_bonus: settings.easy_bonus || 1.3,
    hard_interval: settings.hard_interval || 1.2,
  };

  const now = new Date();

  // Store previous state for review log
  const previousState = card.state;
  const previousInterval = card.interval_days;

  // Calculate new scheduling using SM-2 algorithm
  console.log("🧮 Calling gradeCard with:", { state: card.state, rating });
  const result = gradeCard(card, rating, schedulerSettings, now);

  console.log("✅ gradeCard result:", {
    new_state: result.state,
    new_interval_days: result.interval_days,
    new_due_at: result.due_at,
    new_ease: result.ease,
    new_reps: result.reps,
    learning_step_index: result.learning_step_index,
  });

  // Update card
  // Convert ease to fixed decimal (2 decimal places) to match DECIMAL(3,2) in DB
  const easeRounded = Number(result.ease.toFixed(2));

  const updateData = {
    state: result.state,
    due_at: result.due_at.toISOString(),
    interval_days: result.interval_days,
    ease: easeRounded,
    learning_step_index: result.learning_step_index,
    reps: result.reps,
    lapses: result.lapses,
    last_reviewed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  console.log("💾 Updating card with:", updateData);
  console.log("💾 Update data types:", {
    state: typeof updateData.state,
    ease: typeof updateData.ease,
    ease_value: updateData.ease,
    interval_days: typeof updateData.interval_days,
    learning_step_index: typeof updateData.learning_step_index,
  });

  const { data: updatedCard, error: updateError } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", cardId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) {
    console.error("❌ Card update error:", updateError);
    console.error("❌ Full error details:", JSON.stringify(updateError, null, 2));
    console.error("❌ Error message:", updateError.message);
    console.error("❌ Error code:", updateError.code);
    console.error("❌ Error details:", updateError.details);
    throw updateError;
  }

  if (!updatedCard) {
    console.error("❌ Card update failed: no row affected. Check RLS policies.");
    throw new Error("Card update failed: no row affected");
  }

  console.log("✅ Card updated successfully", {
    id: updatedCard.id,
    old_state: previousState,
    new_state: updatedCard.state,
    new_due_at: updatedCard.due_at,
  });
  invalidateCardCaches();
  invalidateDeckCaches();

  // Create detailed review record
  const reviewData = {
    user_id: userId,
    card_id: cardId,
    deck_id: card.deck_id,
    rating,
    reviewed_at: now.toISOString(),
    elapsed_ms: elapsedMs || null,
    previous_state: previousState,
    previous_interval: previousInterval,
    new_interval: result.interval_days,
    new_due_at: result.due_at.toISOString(),
  };

  console.log("📝 Creating review record:", reviewData);

  const { error: reviewError } = await supabase
    .from("reviews")
    .insert(reviewData);

  if (reviewError) {
    console.error("❌ Review insert error:", reviewError);
    throw reviewError;
  }

  console.log("✅ Review record created");

  // Update deck's updated_at
  await supabase
    .from("decks")
    .update({ updated_at: now.toISOString() })
    .eq("id", card.deck_id)
    .eq("user_id", userId);

  console.log("🔷 reviewCard COMPLETE");
  return updatedCard as Card;
}

// Settings functions
function getLearningSteps(mode: "fast" | "normal" | "deep"): number[] {
  switch (mode) {
    case "fast":
      return [1, 10];
    case "normal":
      return [1, 10, 60];
    case "deep":
      return [1, 10, 60, 180];
    default:
      return [1, 10, 60];
  }
}

export async function getSettings(): Promise<Settings> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    // If no settings exist, create default ones
    const { data: newSettings, error: createError } = await supabase
      .from("settings")
      .insert({
        user_id: userId,
        new_cards_per_day: 20,
        max_reviews_per_day: 9999,
        learning_mode: "normal",
        again_delay_minutes: 10,
        review_order: "mixed",
      })
      .select()
      .single();

    if (createError) throw createError;

    // Convert snake_case to camelCase for frontend
    return convertSettingsToCamelCase(newSettings);
  }

  // Convert snake_case to camelCase for frontend
  return convertSettingsToCamelCase(data);
}

// Helper function to convert database snake_case to frontend camelCase
function convertSettingsToCamelCase(dbSettings: any): Settings {
  return {
    id: dbSettings.id,
    user_id: dbSettings.user_id,
    newCardsPerDay: dbSettings.new_cards_per_day,
    maxReviewsPerDay: dbSettings.max_reviews_per_day,
    learningMode: dbSettings.learning_mode,
    againDelayMinutes: dbSettings.again_delay_minutes,
    reviewOrder: dbSettings.review_order,
    created_at: dbSettings.created_at,
    updated_at: dbSettings.updated_at,
  } as unknown as Settings;
}

export async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Convert camelCase to snake_case for Supabase
  // Frontend uses camelCase, database uses snake_case
  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  };

  // Map camelCase properties to snake_case column names
  if (settings.newCardsPerDay !== undefined) {
    updatePayload.new_cards_per_day = settings.newCardsPerDay;
  }
  if (settings.maxReviewsPerDay !== undefined) {
    updatePayload.max_reviews_per_day = settings.maxReviewsPerDay;
  }
  if (settings.learningMode !== undefined) {
    updatePayload.learning_mode = settings.learningMode;
  }
  if (settings.againDelayMinutes !== undefined) {
    updatePayload.again_delay_minutes = settings.againDelayMinutes;
  }
  if (settings.reviewOrder !== undefined) {
    updatePayload.review_order = settings.reviewOrder;
  }

  console.log("📤 Updating settings with payload:", updatePayload);

  const { data, error } = await supabase
    .from("settings")
    .update(updatePayload)
    .eq("user_id", userId)
    .select();

  if (error) {
    console.error("❌ Supabase error:", {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  if (!data || data.length === 0) {
    console.warn("⚠️ Update affected 0 rows - settings may not exist for this user");
  } else {
    console.log("✅ Supabase update successful:", data);
  }
}

// Stats functions
export async function getCardsStudiedToday(): Promise<number> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("reviewed_at", todayStart.toISOString());

  if (error) throw error;
  return count || 0;
}

export async function getCurrentStreak(): Promise<number> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  let streak = 0;
  let dayStart = new Date(currentDate);

  for (let i = 0; i < 365; i++) {
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const { count, error } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("reviewed_at", dayStart.toISOString())
      .lte("reviewed_at", dayEnd.toISOString());

    if (error) throw error;

    if (count === 0) {
      if (streak === 0 && i === 0) {
        // Check yesterday
        dayStart.setDate(dayStart.getDate() - 1);
        continue;
      }
      break;
    }

    streak++;
    dayStart.setDate(dayStart.getDate() - 1);
  }

  return streak;
}

export async function getTotalReviews(): Promise<number> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { count, error } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count || 0;
}
