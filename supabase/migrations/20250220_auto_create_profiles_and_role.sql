-- ============================================================================
-- Migration: Auto-create profiles on signup + Add role and email columns
-- ============================================================================
-- This migration:
-- 1. Adds 'role' and 'email' columns to profiles table
-- 2. Creates a trigger function to auto-create profiles on user signup
-- 3. Updates RLS policies to allow trigger to insert profiles
-- ============================================================================

-- Step 1: Add role and email columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'founder', 'admin')),
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2: Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role IN ('founder', 'admin');

-- Step 3: Create or replace function to auto-create profile on signup
-- This function creates both settings and profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create default settings (existing logic)
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default profile with email from auth.users
  INSERT INTO public.profiles (
    user_id,
    email,
    role,
    plan,
    ai_cards_used_current_month,
    ai_cards_monthly_limit,
    ai_quota_reset_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    'free',
    0,
    0,
    date_trunc('month', NOW()) + interval '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail signup
    RAISE WARNING 'Failed to create profile/settings for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Step 4: Drop old trigger if it exists and create new one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 5: Update RLS policies to allow trigger to insert profiles
-- Drop the restrictive "Allow waitlist inserts" policy if it exists
DROP POLICY IF EXISTS "Allow waitlist inserts" ON profiles;

-- Create a new policy that allows the trigger (SECURITY DEFINER) to insert profiles
-- The trigger runs with SECURITY DEFINER, so it bypasses RLS, but we ensure
-- users can still only insert their own profiles
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Step 6: Add comment for documentation
COMMENT ON COLUMN profiles.role IS 'User role: user (default), founder (has AI access), admin (has AI access)';
COMMENT ON COLUMN profiles.email IS 'User email from auth.users, synced on signup';

-- Step 7: Verify trigger creation
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgname = 'on_auth_user_created';
