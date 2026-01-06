import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id, name, parent_deck_id, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createDeck(
  name: string,
  parentDeckId?: string | null
): Promise<Deck> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const insertData: any = {
    user_id: userId,
    name,
  };

  if (parentDeckId) {
    insertData.parent_deck_id = parentDeckId;
  }

  const { data, error } = await supabase
    .from("decks")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
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
}

export async function getDeckAndAllChildren(deckId: string): Promise<string[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Recursively get all descendant deck IDs
  const result: string[] = [deckId];
  const toProcess = [deckId];

  while (toProcess.length > 0) {
    const currentDeckId = toProcess.pop()!;

    // Find all direct children of this deck
    const { data: children, error } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("parent_deck_id", currentDeckId);

    if (error) throw error;

    for (const child of children || []) {
      result.push(child.id);
      toProcess.push(child.id);
    }
  }

  return result;
}

export async function getDeckPath(deckId: string): Promise<string> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Build the full path by traversing up the hierarchy
  const pathSegments: string[] = [];
  let currentDeckId: string | null = deckId;

  while (currentDeckId) {
    const { data, error } = await supabase
      .from("decks")
      .select("name, parent_deck_id")
      .eq("id", currentDeckId)
      .eq("user_id", userId)
      .single();

    if (error || !data) break;

    pathSegments.unshift(data.name); // Add to beginning
    currentDeckId = data.parent_deck_id;
  }

  return pathSegments.join("::");
}

export async function listDecksWithPaths(): Promise<Array<{ deck: Deck; path: string }>> {
  const allDecks = await listDecks();
  const decksWithPaths = await Promise.all(
    allDecks.map(async (deck) => ({
      deck,
      path: await getDeckPath(deck.id),
    }))
  );
  return decksWithPaths.sort((a, b) => a.path.localeCompare(b.path));
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

export async function createCard(
  deckId: string,
  front: string,
  back: string
): Promise<Card> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      deck_id: deckId,
      front,
      back,
      state: "new",
      due_at: new Date().toISOString(),
      interval_days: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      suspended: false,
    })
    .select()
    .single();

  if (error) throw error;

  // Update deck's updated_at
  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("user_id", userId);

  return data;
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
  back: string
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

  const { error } = await supabase
    .from("cards")
    .update({
      front,
      back,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;

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
  const now = new Date().toISOString();

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

  // Combine in priority order: learning → review → new
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
  const now = new Date().toISOString();

  // Get all descendant deck IDs
  const deckIds = await getDeckAndAllChildren(deckId);

  const { data, error } = await supabase
    .from("cards")
    .select("state, due_at")
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false);

  if (error) throw error;

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;

  for (const card of data || []) {
    // Only count cards that are due now (consistent with getDueCards logic)
    if (card.state === "new" && card.due_at <= now) {
      newCount++;
    } else if (card.state === "learning" && card.due_at <= now) {
      learningCount++;
    } else if (card.state === "review" && card.due_at <= now) {
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
        else if (card.state === "learning") counts.learning++;
        else if (card.state === "review") counts.review++;
      }
    }
    learningCounts[deckId] = counts;
  }

  return { cardCounts, dueCounts, learningCounts };
}

export async function reviewCard(
  cardId: string,
  rating: "again" | "hard" | "good" | "easy",
  elapsedMs?: number
): Promise<void> {
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
    learning_steps: settings.learning_steps,
    graduating_interval_days: settings.graduating_interval_days,
    starting_ease: settings.starting_ease,
  });

  // Import scheduler
  const { gradeCard } = await import("./scheduler");

  // Prepare scheduler settings
  const schedulerSettings = {
    learning_steps: settings.learning_steps || "1m 10m",
    relearning_steps: settings.relearning_steps || "10m",
    graduating_interval_days: settings.graduating_interval_days || 1,
    easy_interval_days: settings.easy_interval_days || 4,
    starting_ease: settings.starting_ease || 2.5,
    easy_bonus: settings.easy_bonus || 1.3,
    hard_interval: settings.hard_interval || 1.2,
    interval_modifier: settings.interval_modifier || 1.0,
    new_interval_multiplier: settings.new_interval_multiplier || 0.0,
    minimum_interval_days: settings.minimum_interval_days || 1,
    maximum_interval_days: settings.maximum_interval_days || 36500,
    again_delay_minutes: settings.again_delay_minutes || 10,
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
  } as Settings;
}

export async function updateSettings(settings: Partial<Omit<Settings, "user_id" | "created_at" | "updated_at">>): Promise<void> {
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
