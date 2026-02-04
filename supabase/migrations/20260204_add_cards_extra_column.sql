-- Migration: Add extra column to cards table
-- This column stores additional metadata for specialized card types (e.g., theorem name, explanation)

-- Step 1: Add the extra column as JSONB (nullable)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS extra JSONB;

-- Note: No backfill needed - existing cards will have NULL extra, which is valid
-- The application handles NULL extra gracefully
