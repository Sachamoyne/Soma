-- Migration: Add law mode to decks
-- Adds the "law" study mode and its three card types.
-- Fully additive — no existing rows are touched.

-- Step 1: Widen the decks.mode constraint
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_mode_check;

ALTER TABLE decks ADD CONSTRAINT decks_mode_check
  CHECK (mode IN ('classic', 'math', 'languages', 'humanities', 'law'));

-- Step 2: Widen the cards.type constraint
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;

ALTER TABLE cards ADD CONSTRAINT cards_type_check
  CHECK (type IN (
    'basic', 'reversible', 'typed',            -- Classic types
    'definition', 'property', 'formula',        -- Math types
    'vocabulary', 'grammar_rule',               -- Languages types
    'philosophy_concept',                       -- Humanities types
    'statute_article', 'case_brief', 'practical_case'  -- Law types
  ));

-- Note: Law mode card extra JSONB schemas:
--
-- statute_article:
--   { "articleText": "...", "conditions": "...", "pitfalls": "...", "example": "..." }
--   front = article reference (e.g. "Art. 1240 Code civil")
--   back  = summary for backward-compat
--
-- case_brief:
--   { "facts": "...", "procedure": "...", "problem": "...", "solution": "...", "scope": "..." }
--   front = case identifier (e.g. "Cass. crim. 25 juin 1902 — Dominicé")
--   back  = summary for backward-compat
--
-- practical_case:
--   { "qualification": "...", "rules": "...", "application": "...", "conclusion": "..." }
--   front = practical question
--   back  = summary for backward-compat
