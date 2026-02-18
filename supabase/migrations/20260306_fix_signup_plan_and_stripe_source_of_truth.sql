-- ============================================================================
-- Fix signup plan assignment + enforce Stripe as source of truth for paid plans
-- ============================================================================
-- Goals:
-- 1) New signup profiles are always created as FREE (plan/plan_name = 'free').
-- 2) Paid plans are assigned only from Stripe subscription webhook events.
-- 3) Remove trigger that blocks paid -> free downgrade (required for cancel flow).
-- 4) Normalize starter quota to 200 and pro quota to effectively unlimited.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 1) Replace auth->profile trigger: always default to FREE on signup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_user_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    EXECUTE
      'INSERT INTO public.profiles (
         id, user_id, email, role, plan, plan_name, onboarding_status, subscription_status, created_at
       )
       VALUES ($1, $1, $2, ''user'', ''free'', ''free'', ''active'', NULL, NOW())
       ON CONFLICT (id) DO UPDATE
       SET email = COALESCE(public.profiles.email, EXCLUDED.email),
           role = COALESCE(public.profiles.role, EXCLUDED.role),
           plan = COALESCE(public.profiles.plan, ''free''),
           plan_name = COALESCE(public.profiles.plan_name, ''free''),
           onboarding_status = COALESCE(public.profiles.onboarding_status, ''active''),
           subscription_status = COALESCE(public.profiles.subscription_status, EXCLUDED.subscription_status)'
    USING NEW.id, NEW.email;
  ELSE
    INSERT INTO public.profiles (
      id, email, role, plan, plan_name, onboarding_status, subscription_status, created_at
    )
    VALUES (
      NEW.id, NEW.email, 'user', 'free', 'free', 'active', NULL, NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        role = COALESCE(public.profiles.role, EXCLUDED.role),
        plan = COALESCE(public.profiles.plan, 'free'),
        plan_name = COALESCE(public.profiles.plan_name, 'free'),
        onboarding_status = COALESCE(public.profiles.onboarding_status, 'active'),
        subscription_status = COALESCE(public.profiles.subscription_status, EXCLUDED.subscription_status);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profiles ON auth.users;
CREATE TRIGGER on_auth_user_created_profiles
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- ----------------------------------------------------------------------------
-- 2) Remove anti-downgrade trigger (Stripe cancel must be able to downgrade)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS prevent_paid_to_free_downgrade ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_paid_to_free_downgrade();

-- ----------------------------------------------------------------------------
-- 3) Backfill safety: paid plan without active subscription => free
-- ----------------------------------------------------------------------------
UPDATE public.profiles
SET
  plan = 'free',
  plan_name = 'free',
  onboarding_status = 'active',
  subscription_status = COALESCE(subscription_status, 'free'),
  subscription_id = CASE
    WHEN COALESCE(subscription_status, 'free') = 'active' THEN subscription_id
    ELSE NULL
  END
WHERE
  COALESCE(role, 'user') NOT IN ('founder', 'admin')
  AND (plan IN ('starter', 'pro') OR plan_name IN ('starter', 'pro'))
  AND COALESCE(subscription_status, '') <> 'active';

-- ----------------------------------------------------------------------------
-- 4) Normalize quota trigger (starter=200, pro=unlimited sentinel)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_ai_cards_quota_with_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  CASE NEW.plan
    WHEN 'free' THEN
      NEW.ai_cards_monthly_limit := 0;
    WHEN 'starter' THEN
      NEW.ai_cards_monthly_limit := 200;
    WHEN 'pro' THEN
      NEW.ai_cards_monthly_limit := 2147483647;
    ELSE
      NEW.ai_cards_monthly_limit := COALESCE(NEW.ai_cards_monthly_limit, 0);
  END CASE;

  IF NEW.ai_quota_reset_at IS NULL THEN
    NEW.ai_quota_reset_at := date_trunc('month', NOW()) + interval '1 month';
  END IF;

  IF NEW.ai_cards_used_current_month IS NULL THEN
    NEW.ai_cards_used_current_month := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ai_cards_quota_trigger ON public.profiles;
CREATE TRIGGER sync_ai_cards_quota_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ai_cards_quota_with_plan();

UPDATE public.profiles
SET ai_cards_monthly_limit = CASE plan
  WHEN 'starter' THEN 200
  WHEN 'pro' THEN 2147483647
  ELSE 0
END
WHERE plan IN ('free', 'starter', 'pro');
