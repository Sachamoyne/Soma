-- Migration: Add exam mode to deck_settings
-- Date: 2026-03-08
-- Description: Allow per-deck exam date to activate exam preparation mode

ALTER TABLE deck_settings
  ADD COLUMN IF NOT EXISTS exam_date DATE NULL;
