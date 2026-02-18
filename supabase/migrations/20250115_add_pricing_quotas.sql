-- Migration: Add pricing plan and AI quota fields to profiles table
-- This migration adds subscription plan tracking and AI card generation quotas

-- Step 1: Add new columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro')),
  ADD COLUMN IF NOT EXISTS ai_cards_used_current_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_cards_monthly_limit INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month');

-- Step 2: Update existing profiles to have correct default values
-- Set reset date to start of next month for all existing users
UPDATE profiles
SET 
  ai_quota_reset_at = date_trunc('month', NOW()) + interval '1 month',
  plan = COALESCE(plan, 'free'),
  ai_cards_used_current_month = COALESCE(ai_cards_used_current_month, 0),
  ai_cards_monthly_limit = CASE 
    WHEN plan = 'starter' THEN 200
    WHEN plan = 'pro' THEN 2147483647
    ELSE 0
  END
WHERE ai_quota_reset_at IS NULL OR ai_cards_monthly_limit IS NULL;

-- Step 3: Create function to reset quotas at the beginning of each month
-- This function will be called by a scheduled job or trigger
CREATE OR REPLACE FUNCTION reset_monthly_ai_quotas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET 
    ai_cards_used_current_month = 0,
    ai_quota_reset_at = date_trunc('month', NOW()) + interval '1 month'
  WHERE 
    -- Only reset if we're past the reset date
    ai_quota_reset_at <= NOW();
END;
$$;

-- Step 4: Create function to check and increment quota
-- This function checks if user can generate cards and increments the counter
CREATE OR REPLACE FUNCTION check_and_increment_ai_quota(
  p_user_id UUID,
  p_card_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_can_generate BOOLEAN;
  v_remaining INTEGER;
  v_result JSONB;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM profiles
  WHERE user_id = p_user_id;

  -- If no profile exists, create one with free plan
  IF NOT FOUND THEN
    INSERT INTO profiles (user_id, plan, ai_cards_used_current_month, ai_cards_monthly_limit, ai_quota_reset_at)
    VALUES (p_user_id, 'free', 0, 0, date_trunc('month', NOW()) + interval '1 month')
    RETURNING * INTO v_profile;
  END IF;

  -- Check if quota needs to be reset (new month started)
  IF v_profile.ai_quota_reset_at <= NOW() THEN
    UPDATE profiles
    SET 
      ai_cards_used_current_month = 0,
      ai_quota_reset_at = date_trunc('month', NOW()) + interval '1 month'
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  END IF;

  -- Check if user can generate cards
  IF v_profile.plan = 'free' THEN
    v_can_generate := false;
    v_remaining := 0;
  ELSIF v_profile.ai_cards_used_current_month + p_card_count <= v_profile.ai_cards_monthly_limit THEN
    v_can_generate := true;
    v_remaining := v_profile.ai_cards_monthly_limit - (v_profile.ai_cards_used_current_month + p_card_count);
    
    -- Increment the counter
    UPDATE profiles
    SET ai_cards_used_current_month = ai_cards_used_current_month + p_card_count
    WHERE user_id = p_user_id;
  ELSE
    v_can_generate := false;
    v_remaining := GREATEST(0, v_profile.ai_cards_monthly_limit - v_profile.ai_cards_used_current_month);
  END IF;

  -- Return result
  v_result := jsonb_build_object(
    'can_generate', v_can_generate,
    'plan', v_profile.plan,
    'used', v_profile.ai_cards_used_current_month,
    'limit', v_profile.ai_cards_monthly_limit,
    'remaining', v_remaining,
    'reset_at', v_profile.ai_quota_reset_at
  );

  RETURN v_result;
END;
$$;

-- Step 5: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_quota_reset ON profiles(ai_quota_reset_at);

-- Step 6: Add comment for documentation
COMMENT ON COLUMN profiles.plan IS 'Subscription plan: free, starter, or pro';
COMMENT ON COLUMN profiles.ai_cards_used_current_month IS 'Number of AI-generated cards used in current month';
COMMENT ON COLUMN profiles.ai_cards_monthly_limit IS 'Monthly limit for AI-generated cards (0 for free, 200 for starter, unlimited for pro via INT sentinel)';
COMMENT ON COLUMN profiles.ai_quota_reset_at IS 'Timestamp when quota resets (start of next month)';
