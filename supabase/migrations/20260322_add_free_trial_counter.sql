-- ============================================================================
-- Free trial AI card generation counter
-- Free plan users get FREE_TRIAL_LIMIT (30) AI-generated cards lifetime.
-- This counter is separate from the monthly quota used by paid plans:
--   - Never resets (lifetime, not monthly)
--   - Tracks AI-generated cards only (paid plan quota tracks ALL cards)
--   - Only enforced for plan = 'free'
-- ============================================================================

-- 1. Add column with safe default
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_free_trial_used INTEGER NOT NULL DEFAULT 0;

-- Clamp any unexpected negative values to 0
UPDATE public.profiles
SET ai_free_trial_used = 0
WHERE ai_free_trial_used < 0;

-- 2. Non-negative constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS ai_free_trial_used_non_negative;

ALTER TABLE public.profiles
  ADD CONSTRAINT ai_free_trial_used_non_negative
  CHECK (ai_free_trial_used >= 0);

-- 3. Atomic increment function (prevents double-counting on concurrent requests)
-- Returns the new value after increment, or -1 if the increment would exceed p_limit.
CREATE OR REPLACE FUNCTION public.increment_ai_free_trial_used(
  p_user_id UUID,
  p_count  INTEGER,
  p_limit  INTEGER DEFAULT 30
)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  UPDATE public.profiles
  SET ai_free_trial_used = ai_free_trial_used + p_count
  WHERE id = p_user_id
    AND plan = 'free'
    AND ai_free_trial_used + p_count <= p_limit
  RETURNING ai_free_trial_used INTO v_new;

  IF NOT FOUND THEN
    RETURN -1;  -- Would exceed limit, or user not free, or user not found
  END IF;

  RETURN v_new;
END;
$$;
