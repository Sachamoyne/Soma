-- Migration: Add languages mode to decks
-- This enables the "Langues" study mode for vocabulary learning

-- Step 1: Drop existing mode constraint
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_mode_check;

-- Step 2: Add new constraint with 'languages' mode
ALTER TABLE decks ADD CONSTRAINT decks_mode_check 
  CHECK (mode IN ('classic', 'math', 'languages'));

-- Step 3: Add config column for mode-specific settings (JSONB)
-- For languages mode, this will store:
-- {
--   "sourceLanguage": "French",
--   "targetLanguage": "English",
--   "vocabDirection": "normal" | "reversed" | "both"
-- }
ALTER TABLE decks ADD COLUMN IF NOT EXISTS config JSONB DEFAULT NULL;

-- Step 4: Add vocabulary and grammar_rule card types
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;

ALTER TABLE cards ADD CONSTRAINT cards_type_check 
  CHECK (type IN (
    'basic', 'reversible', 'typed',           -- Classic types
    'definition', 'property', 'formula',       -- Math types
    'vocabulary', 'grammar_rule'               -- Languages types
  ));

-- Note: Languages mode cards (vocabulary, grammar_rule) behave like 'basic' during review.
-- The semantic type is preserved for filtering and future enhancements.
