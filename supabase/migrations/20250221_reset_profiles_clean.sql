-- ============================================================================
-- Migration: Complete reset of profiles table with clean, simple schema
-- ============================================================================
-- This migration:
-- 1. Drops existing profiles table (CASCADE to remove dependencies)
-- 2. Recreates profiles with minimal, clean schema
-- 3. Sets up simple, clear RLS policies
-- 4. NO triggers on auth.users (profile creation happens in app code)
-- ============================================================================

-- Step 1: Drop all existing triggers on auth.users related to profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.create_default_settings();

-- Step 2: Drop existing profiles table and all its dependencies
DROP TABLE IF EXISTS profiles CASCADE;

-- Step 3: Recreate profiles table with clean, minimal schema
-- Note: Includes quota and subscription fields needed by application code
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'founder', 'admin')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro')),
  ai_cards_used_current_month INTEGER NOT NULL DEFAULT 0,
  ai_cards_monthly_limit INTEGER NOT NULL DEFAULT 0,
  ai_quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month'),
  stripe_customer_id TEXT,
  subscription_id TEXT,
  subscription_status TEXT,
  plan_name TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Create index on role for faster queries (founders/admins)
CREATE INDEX idx_profiles_role ON profiles(role) WHERE role IN ('founder', 'admin');

-- Step 5: Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop any existing policies (clean slate)
DROP POLICY IF EXISTS "Allow waitlist inserts" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Step 7: Create ONLY the required RLS policies (simple and clear)

-- INSERT: Users can insert their own profile
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- SELECT: Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- UPDATE: Users can update their own profile
-- Note: role and plan should be managed server-side only (via service role client)
-- RLS cannot easily restrict specific columns, so server code must enforce this
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Step 8: Add comments for documentation
COMMENT ON TABLE profiles IS 'User profiles - created explicitly in application code after signup/login';
COMMENT ON COLUMN profiles.id IS 'Primary key, matches auth.users.id';
COMMENT ON COLUMN profiles.email IS 'User email, synced from auth.users';
COMMENT ON COLUMN profiles.role IS 'User role: user (default), founder (has AI access), admin (has AI access)';
COMMENT ON COLUMN profiles.plan IS 'Subscription plan: free (default), starter, pro';
