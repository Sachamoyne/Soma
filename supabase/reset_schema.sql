-- ============================================================================
-- RESET SCHEMA - Soma Flashcard App
-- Execute this in Supabase SQL Editor to start fresh
-- ============================================================================

-- STEP 1: Drop everything (in correct order due to dependencies)
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_default_settings();

DROP POLICY IF EXISTS "Users can delete their own settings" ON settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON settings;
DROP POLICY IF EXISTS "Users can create their own settings" ON settings;
DROP POLICY IF EXISTS "Users can view their own settings" ON settings;

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Allow waitlist inserts" ON profiles;

DROP POLICY IF EXISTS "Users can delete their own generated_cards" ON generated_cards;
DROP POLICY IF EXISTS "Users can update their own generated_cards" ON generated_cards;
DROP POLICY IF EXISTS "Users can create their own generated_cards" ON generated_cards;
DROP POLICY IF EXISTS "Users can view their own generated_cards" ON generated_cards;

DROP POLICY IF EXISTS "Users can delete their own imports" ON imports;
DROP POLICY IF EXISTS "Users can update their own imports" ON imports;
DROP POLICY IF EXISTS "Users can create their own imports" ON imports;
DROP POLICY IF EXISTS "Users can view their own imports" ON imports;

DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON reviews;

DROP POLICY IF EXISTS "Users can delete their own cards" ON cards;
DROP POLICY IF EXISTS "Users can update their own cards" ON cards;
DROP POLICY IF EXISTS "Users can create their own cards" ON cards;
DROP POLICY IF EXISTS "Users can view their own cards" ON cards;

DROP POLICY IF EXISTS "Users can delete their own decks" ON decks;
DROP POLICY IF EXISTS "Users can update their own decks" ON decks;
DROP POLICY IF EXISTS "Users can create their own decks" ON decks;
DROP POLICY IF EXISTS "Users can view their own decks" ON decks;

DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS generated_cards CASCADE;
DROP TABLE IF EXISTS imports CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS decks CASCADE;

-- ============================================================================
-- STEP 2: Create tables with complete schema
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Decks table
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cards table (with full SM-2 scheduler support)
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interval_days INTEGER NOT NULL DEFAULT 0,
  ease DECIMAL(3,2) NOT NULL DEFAULT 2.50,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  learning_step_index INTEGER NOT NULL DEFAULT 0,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reviews table (with detailed tracking)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  elapsed_ms INTEGER,
  previous_state TEXT,
  previous_interval INTEGER,
  new_interval INTEGER,
  new_due_at TIMESTAMPTZ
);

-- Imports table
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'image')),
  text TEXT NOT NULL,
  page_count INTEGER,
  ocr_confidence DECIMAL(5,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated cards table
CREATE TABLE generated_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings table (one row per user, with full Anki SM-2 settings)
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  new_cards_per_day INTEGER NOT NULL DEFAULT 20,
  max_reviews_per_day INTEGER NOT NULL DEFAULT 9999,
  learning_mode TEXT NOT NULL DEFAULT 'normal' CHECK (learning_mode IN ('fast', 'normal', 'deep')),
  again_delay_minutes INTEGER NOT NULL DEFAULT 10,
  review_order TEXT NOT NULL DEFAULT 'mixed' CHECK (review_order IN ('mixed', 'oldFirst', 'newFirst')),
  learning_steps TEXT NOT NULL DEFAULT '1m 10m',
  relearning_steps TEXT NOT NULL DEFAULT '10m',
  graduating_interval_days INTEGER NOT NULL DEFAULT 1,
  easy_interval_days INTEGER NOT NULL DEFAULT 4,
  starting_ease DECIMAL(3,2) NOT NULL DEFAULT 2.50,
  easy_bonus DECIMAL(3,2) NOT NULL DEFAULT 1.30,
  hard_interval DECIMAL(3,2) NOT NULL DEFAULT 1.20,
  interval_modifier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  new_interval_multiplier DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  minimum_interval_days INTEGER NOT NULL DEFAULT 1,
  maximum_interval_days INTEGER NOT NULL DEFAULT 36500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles table (waitlist state)
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waitlist'
);

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================

CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_decks_parent_deck_id ON decks(parent_deck_id);

CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_deck_id ON cards(deck_id);
CREATE INDEX idx_cards_due_at ON cards(due_at);
CREATE INDEX idx_cards_state ON cards(state);
CREATE INDEX idx_cards_state_due ON cards(state, due_at) WHERE NOT suspended;

CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_card_id ON reviews(card_id);
CREATE INDEX idx_reviews_reviewed_at ON reviews(reviewed_at);

CREATE INDEX idx_imports_user_id ON imports(user_id);
CREATE INDEX idx_generated_cards_user_id ON generated_cards(user_id);

-- ============================================================================
-- STEP 4: Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 5: Create RLS Policies
-- ============================================================================

-- Decks policies
CREATE POLICY "Users can view their own decks"
  ON decks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own decks"
  ON decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks"
  ON decks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks"
  ON decks FOR DELETE
  USING (auth.uid() = user_id);

-- Cards policies
CREATE POLICY "Users can view their own cards"
  ON cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cards"
  ON cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards"
  ON cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards"
  ON cards FOR DELETE
  USING (auth.uid() = user_id);

-- Reviews policies
CREATE POLICY "Users can view their own reviews"
  ON reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- Imports policies
CREATE POLICY "Users can view their own imports"
  ON imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own imports"
  ON imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own imports"
  ON imports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imports"
  ON imports FOR DELETE
  USING (auth.uid() = user_id);

-- Generated cards policies
CREATE POLICY "Users can view their own generated_cards"
  ON generated_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own generated_cards"
  ON generated_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own generated_cards"
  ON generated_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generated_cards"
  ON generated_cards FOR DELETE
  USING (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "Users can view their own settings"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings"
  ON settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Profiles policies
CREATE POLICY "Allow waitlist inserts"
  ON profiles FOR INSERT
  WITH CHECK (status = 'waitlist');

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
  ON settings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 6: Create trigger to auto-create settings for new users
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO settings (
    user_id,
    new_cards_per_day,
    max_reviews_per_day,
    learning_mode,
    again_delay_minutes,
    review_order,
    learning_steps,
    relearning_steps,
    graduating_interval_days,
    easy_interval_days,
    starting_ease,
    easy_bonus,
    hard_interval,
    interval_modifier,
    new_interval_multiplier,
    minimum_interval_days,
    maximum_interval_days
  ) VALUES (
    NEW.id,
    20,
    9999,
    'normal',
    10,
    'mixed',
    '1m 10m',
    '10m',
    1,
    4,
    2.50,
    1.30,
    1.20,
    1.00,
    0.00,
    1,
    36500
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_settings();

-- ============================================================================
-- DONE! Schema reset complete
-- ============================================================================

-- Verify RLS is enabled
SELECT
  schemaname,
  tablename,
  CASE rowsecurity
    WHEN true THEN '✓ ENABLED'
    ELSE '✗ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
