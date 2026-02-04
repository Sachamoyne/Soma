-- Migration: Add revision mode to decks
-- This enables different study modes (classic, math) for decks

-- Step 1: Add the column with a default value
ALTER TABLE decks ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'classic';

-- Step 2: Backfill all existing decks with 'classic' mode
UPDATE decks SET mode = 'classic' WHERE mode IS NULL;

-- Step 3: Add NOT NULL constraint (safe after backfill)
ALTER TABLE decks ALTER COLUMN mode SET NOT NULL;

-- Step 4: Add CHECK constraint to ensure valid values
-- Using a separate ALTER to make it easy to add more modes later
ALTER TABLE decks ADD CONSTRAINT decks_mode_check CHECK (mode IN ('classic', 'math'));

-- Step 5: Add index for potential filtering by mode
CREATE INDEX IF NOT EXISTS idx_decks_mode ON decks(mode);
