export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      decks: {
        Row: {
          id: string
          user_id: string
          name: string
          parent_deck_id: string | null
          mode: "classic" | "math"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          parent_deck_id?: string | null
          mode?: "classic" | "math"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          parent_deck_id?: string | null
          mode?: "classic" | "math"
          created_at?: string
          updated_at?: string
        }
      }
      cards: {
        Row: {
          id: string
          user_id: string
          deck_id: string
          front: string
          back: string
          type: "basic" | "reversible" | "typed" | "definition" | "property" | "formula"
          extra: Json | null
          state: "new" | "learning" | "review" | "relearning"
          due_at: string
          interval_days: number
          ease: number
          reps: number
          lapses: number
          suspended: boolean
          learning_step_index: number
          last_reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          deck_id: string
          front: string
          back: string
          type?: "basic" | "reversible" | "typed" | "definition" | "property" | "formula"
          extra?: Json | null
          state?: "new" | "learning" | "review" | "relearning"
          due_at?: string
          interval_days?: number
          ease?: number
          reps?: number
          lapses?: number
          suspended?: boolean
          learning_step_index?: number
          last_reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          deck_id?: string
          front?: string
          back?: string
          type?: "basic" | "reversible" | "typed" | "definition" | "property" | "formula"
          extra?: Json | null
          state?: "new" | "learning" | "review" | "relearning"
          due_at?: string
          interval_days?: number
          ease?: number
          reps?: number
          lapses?: number
          suspended?: boolean
          learning_step_index?: number
          last_reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      reviews: {
        Row: {
          id: string
          user_id: string
          card_id: string
          deck_id: string
          rating: "again" | "hard" | "good" | "easy"
          reviewed_at: string
          elapsed_ms: number | null
          previous_state: string | null
          previous_interval: number | null
          new_interval: number | null
          new_due_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          deck_id: string
          rating: "again" | "hard" | "good" | "easy"
          reviewed_at?: string
          elapsed_ms?: number | null
          previous_state?: string | null
          previous_interval?: number | null
          new_interval?: number | null
          new_due_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          card_id?: string
          deck_id?: string
          rating?: "again" | "hard" | "good" | "easy"
          reviewed_at?: string
          elapsed_ms?: number | null
          previous_state?: string | null
          previous_interval?: number | null
          new_interval?: number | null
          new_due_at?: string | null
        }
      }
      imports: {
        Row: {
          id: string
          user_id: string
          deck_id: string | null
          filename: string
          file_type: "pdf" | "image"
          text: string
          page_count: number | null
          ocr_confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          deck_id?: string | null
          filename: string
          file_type: "pdf" | "image"
          text: string
          page_count?: number | null
          ocr_confidence?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          deck_id?: string | null
          filename?: string
          file_type?: "pdf" | "image"
          text?: string
          page_count?: number | null
          ocr_confidence?: number | null
          created_at?: string
        }
      }
      generated_cards: {
        Row: {
          id: string
          user_id: string
          import_id: string
          deck_id: string
          front: string
          back: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          import_id: string
          deck_id: string
          front: string
          back: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          import_id?: string
          deck_id?: string
          front?: string
          back?: string
          created_at?: string
        }
      }
      settings: {
        Row: {
          id?: string
          user_id: string
          new_cards_per_day: number
          max_reviews_per_day: number
          learning_mode: "fast" | "normal" | "deep"
          again_delay_minutes: number
          review_order: "mixed" | "oldFirst" | "newFirst"
          learning_steps: string
          relearning_steps: string
          graduating_interval_days: number
          easy_interval_days: number
          starting_ease: number
          easy_bonus: number
          hard_interval: number
          interval_modifier: number
          new_interval_multiplier: number
          minimum_interval_days: number
          maximum_interval_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          new_cards_per_day?: number
          max_reviews_per_day?: number
          learning_mode?: "fast" | "normal" | "deep"
          again_delay_minutes?: number
          review_order?: "mixed" | "oldFirst" | "newFirst"
          learning_steps?: string
          relearning_steps?: string
          graduating_interval_days?: number
          easy_interval_days?: number
          starting_ease?: number
          easy_bonus?: number
          hard_interval?: number
          interval_modifier?: number
          new_interval_multiplier?: number
          minimum_interval_days?: number
          maximum_interval_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          new_cards_per_day?: number
          max_reviews_per_day?: number
          learning_mode?: "fast" | "normal" | "deep"
          again_delay_minutes?: number
          review_order?: "mixed" | "oldFirst" | "newFirst"
          learning_steps?: string
          relearning_steps?: string
          graduating_interval_days?: number
          easy_interval_days?: number
          starting_ease?: number
          easy_bonus?: number
          hard_interval?: number
          interval_modifier?: number
          new_interval_multiplier?: number
          minimum_interval_days?: number
          maximum_interval_days?: number
          created_at?: string
          updated_at?: string
        }
      }
      deck_settings: {
        Row: {
          id: string
          deck_id: string
          user_id: string
          new_cards_per_day: number | null
          max_reviews_per_day: number | null
          review_order: "mixed" | "oldFirst" | "newFirst" | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          user_id: string
          new_cards_per_day?: number | null
          max_reviews_per_day?: number | null
          review_order?: "mixed" | "oldFirst" | "newFirst" | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          user_id?: string
          new_cards_per_day?: number | null
          max_reviews_per_day?: number | null
          review_order?: "mixed" | "oldFirst" | "newFirst" | null
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          user_id: string
          status: string
          stripe_customer_id: string | null
          subscription_id: string | null
          subscription_status: string | null
          plan_name: string | null
          ai_cards_limit: number | null
          ai_cards_used: number | null
          current_period_end: string | null
        }
        Insert: {
          user_id: string
          status?: string
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          plan_name?: string | null
          ai_cards_limit?: number | null
          ai_cards_used?: number | null
          current_period_end?: string | null
        }
        Update: {
          user_id?: string
          status?: string
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          plan_name?: string | null
          ai_cards_limit?: number | null
          ai_cards_used?: number | null
          current_period_end?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_deck_anki_counts: {
        Args: {
          deck_ids: string[]
        }
        Returns: {
          deck_id: string
          new_due: number
          learning_due: number
          review_due: number
          total_cards: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
