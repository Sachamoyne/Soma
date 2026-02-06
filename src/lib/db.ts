// Re-export Supabase types and utilities
// This file replaces the old Dexie implementation
export type {
  Deck,
  Card,
  Review,
  ImportDoc,
  GeneratedCard,
  Settings,
  IntervalPreview,
  DeckMode,
  VocabDirection,
  LanguagesConfig,
  DeckConfig,
} from "./supabase-db";

// Note: The old Dexie 'db' object is no longer available
// All operations now go through Supabase functions in @/store/decks
// which automatically filter by user_id
