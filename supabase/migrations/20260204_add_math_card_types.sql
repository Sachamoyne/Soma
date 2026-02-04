-- Migration: Add math card types
-- Extends the card type constraint to support math-specific card types

-- Step 1: Drop the existing constraint
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;

-- Step 2: Add the new constraint with all card types
-- Classic types: basic, reversible, typed
-- Math types: definition, property, formula
ALTER TABLE cards ADD CONSTRAINT cards_type_check 
  CHECK (type IN ('basic', 'reversible', 'typed', 'definition', 'property', 'formula'));

-- Note: Existing cards are NOT modified. They retain their original type.
-- Math types behave like 'basic' during review (for now).
