-- Migration: Add humanities mode to decks
-- This enables the "Humanities" study mode for philosophy concept cards

-- Step 1: Drop existing mode constraint
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_mode_check;

-- Step 2: Add new constraint with 'humanities' mode
ALTER TABLE decks ADD CONSTRAINT decks_mode_check
  CHECK (mode IN ('classic', 'math', 'languages', 'humanities'));

-- Step 3: Add philosophy_concept card type
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;

ALTER TABLE cards ADD CONSTRAINT cards_type_check
  CHECK (type IN (
    'basic', 'reversible', 'typed',           -- Classic types
    'definition', 'property', 'formula',       -- Math types
    'vocabulary', 'grammar_rule',              -- Languages types
    'philosophy_concept'                       -- Humanities types
  ));

-- Note: Humanities mode cards (philosophy_concept) use the 'extra' JSONB field
-- to store structured data:
-- {
--   "author": "Descartes",
--   "work": "Meditations metaphysiques",
--   "date": "1641",
--   "explanation": "Le cogito est le premier principe...",
--   "example": "Dans une dissertation sur la conscience..."
-- }
-- The 'front' field stores the concept name.
-- The 'back' field stores a summary for backward compatibility.
