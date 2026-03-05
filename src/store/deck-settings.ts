import { createClient } from "@/lib/supabase/client";
import type { Settings } from "./settings";
import { getSettings } from "./settings";
import { invalidateCardCaches } from "@/lib/supabase-db";

// Helper to dispatch counts updated event (for UI refresh)
function dispatchCountsUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soma-counts-updated"));
  }
}

// Deck settings are the same structure as Settings, but all fields are nullable (null = inherit from global)
// Fields are NOT optional (always present in the object) to prevent uncontrolled component errors
export type DeckSettings = {
  id?: string;
  deckId: string;
  newCardsPerDay: number | null;
  maxReviewsPerDay: number | null;
  reviewOrder: "mixed" | "oldFirst" | "newFirst" | null;
  examDate: string | null;
};

// Database row structure (snake_case)
type DeckSettingsRow = {
  id: string;
  user_id: string;
  deck_id: string;
  new_cards_per_day: number | null;
  max_reviews_per_day: number | null;
  review_order: string | null;
  exam_date: string | null;
  created_at: string;
  updated_at: string;
};

// Convert from database format to UI format
function fromDatabaseRow(row: DeckSettingsRow): DeckSettings {
  return {
    id: row.id,
    deckId: row.deck_id,
    newCardsPerDay: row.new_cards_per_day,
    maxReviewsPerDay: row.max_reviews_per_day,
    reviewOrder: row.review_order as "mixed" | "oldFirst" | "newFirst" | null,
    examDate: row.exam_date ?? null,
  };
}

// Convert from UI format to database format
function toDatabaseRow(settings: DeckSettings): Partial<DeckSettingsRow> {
  return {
    new_cards_per_day: settings.newCardsPerDay ?? null,
    max_reviews_per_day: settings.maxReviewsPerDay ?? null,
    review_order: settings.reviewOrder ?? null,
    exam_date: settings.examDate ?? null,
  };
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

/**
 * Get deck-specific settings (returns null values for fields that should inherit from global)
 */
export async function getDeckSettings(deckId: string): Promise<DeckSettings> {
  const supabase = createClient();
  const userId = await getCurrentUserId();


  const { data, error } = await supabase
    .from("deck_settings")
    .select("*")
    .eq("user_id", userId)
    .eq("deck_id", deckId)
    .maybeSingle();

  if (error) {
    console.error("[getDeckSettings] Database error:", error);
    // Add more context to the error
    const enhancedError = new Error(
      `Failed to fetch deck settings: ${error.message}. ` +
      `Code: ${error.code}, Details: ${error.details || "none"}`
    );
    throw enhancedError;
  }

  if (!data) {
    // No deck-specific settings exist, return empty (all inherited)
    return {
      deckId,
      newCardsPerDay: null,
      maxReviewsPerDay: null,
      reviewOrder: null,
      examDate: null,
    };
  }

  return fromDatabaseRow(data);
}

/**
 * Get effective settings for a deck (global settings merged with deck overrides)
 */
export async function getEffectiveDeckSettings(deckId: string): Promise<Settings> {
  const [globalSettings, deckSettings] = await Promise.all([
    getSettings(),
    getDeckSettings(deckId),
  ]);

  // Merge: deck settings override global settings
  return {
    id: "global",
    newCardsPerDay: deckSettings.newCardsPerDay ?? globalSettings.newCardsPerDay,
    maxReviewsPerDay: deckSettings.maxReviewsPerDay ?? globalSettings.maxReviewsPerDay,
    reviewOrder: deckSettings.reviewOrder ?? globalSettings.reviewOrder,
  };
}

/**
 * Update deck-specific settings
 */
export async function updateDeckSettings(deckId: string, settings: DeckSettings): Promise<DeckSettings> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  // Check if deck settings already exist
  const { data: existing } = await supabase
    .from("deck_settings")
    .select("id")
    .eq("user_id", userId)
    .eq("deck_id", deckId)
    .maybeSingle();

  const dbSettings = toDatabaseRow(settings);

  if (existing) {
    // Update existing settings
    const { data, error } = await supabase
      .from("deck_settings")
      .update(dbSettings)
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    
    // Invalidate cache and notify UI so counts reflect new limits immediately
    invalidateCardCaches();
    dispatchCountsUpdated();
    
    return fromDatabaseRow(data as DeckSettingsRow);
  } else {
    // Create new settings
    const { data, error } = await supabase
      .from("deck_settings")
      .insert({
        user_id: userId,
        deck_id: deckId,
        ...dbSettings,
      })
      .select("*")
      .single();

    if (error) throw error;
    
    // Invalidate cache and notify UI so counts reflect new limits immediately
    invalidateCardCaches();
    dispatchCountsUpdated();
    
    return fromDatabaseRow(data as DeckSettingsRow);
  }
}

/**
 * Set or clear the exam date for a deck.
 * Pass null to deactivate exam mode.
 */
export async function setExamDate(deckId: string, examDate: string | null): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data: existing } = await supabase
    .from("deck_settings")
    .select("id")
    .eq("user_id", userId)
    .eq("deck_id", deckId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("deck_settings")
      .update({ exam_date: examDate })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("deck_settings")
      .insert({ user_id: userId, deck_id: deckId, exam_date: examDate });
    if (error) throw error;
  }

  invalidateCardCaches();
  dispatchCountsUpdated();
}

/**
 * Reset deck settings to global defaults (delete all overrides)
 */
export async function resetDeckSettings(deckId: string): Promise<void> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("deck_settings")
    .delete()
    .eq("user_id", userId)
    .eq("deck_id", deckId);

  if (error) throw error;
  
  // Invalidate cache and notify UI so counts reflect global limits immediately
  invalidateCardCaches();
  dispatchCountsUpdated();
}
