-- ============================================================================
-- Migration: Nouvelle structure tarifaire - Limite de cartes par plan
-- ============================================================================
-- CHANGEMENT:
-- - Starter: 200 cartes max (toutes confondues), 2,49€/mois
-- - Pro: illimité, 7,99€/mois
-- - Free: pas de limite de cartes manuelles, pas d'accès IA
--
-- ANCIEN MODÈLE: cartes IA par mois (starter=300, pro=1000)
-- NOUVEAU MODÈLE: nombre total de cartes par utilisateur
-- ============================================================================

-- ============================================================================
-- 1) Trigger BEFORE INSERT sur cards pour enforcer la limite Starter
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_card_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_plan TEXT;
  user_role TEXT;
  card_count INTEGER;
BEGIN
  -- Récupérer le plan et le rôle de l'utilisateur
  SELECT plan, role INTO user_plan, user_role
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Les admins et founders n'ont pas de limite
  IF user_role IN ('founder', 'admin') THEN
    RETURN NEW;
  END IF;

  -- Seul le plan Starter a une limite de cartes
  IF user_plan = 'starter' THEN
    SELECT count(*) INTO card_count
    FROM public.cards
    WHERE user_id = NEW.user_id;

    IF card_count >= 200 THEN
      RAISE EXCEPTION 'CARD_LIMIT_REACHED: You have reached the maximum of 200 cards on the Starter plan. Upgrade to Pro for unlimited cards.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS check_card_limit_trigger ON public.cards;

-- Créer le trigger
CREATE TRIGGER check_card_limit_trigger
  BEFORE INSERT ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.check_card_limit();

COMMENT ON FUNCTION public.check_card_limit() IS
  'Enforce card limit: Starter plan max 200 cards, Pro unlimited, Free unlimited (manual only)';

-- ============================================================================
-- 2) Mettre à jour le trigger sync_ai_cards_quota_with_plan
--    Réutiliser ai_cards_monthly_limit comme "total card limit" du plan
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_ai_cards_quota_with_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Synchroniser ai_cards_monthly_limit avec le plan
  -- Nouvelle signification: limite totale de cartes (pas mensuelle)
  CASE NEW.plan
    WHEN 'free' THEN
      NEW.ai_cards_monthly_limit := 0;
    WHEN 'starter' THEN
      NEW.ai_cards_monthly_limit := 200;
    WHEN 'pro' THEN
      NEW.ai_cards_monthly_limit := 999999;
    ELSE
      NEW.ai_cards_monthly_limit := COALESCE(NEW.ai_cards_monthly_limit, 0);
  END CASE;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3) Backfill: corriger les profils existants
-- ============================================================================

UPDATE public.profiles
SET ai_cards_monthly_limit = CASE plan
    WHEN 'starter' THEN 200
    WHEN 'pro' THEN 999999
    ELSE 0
  END
WHERE plan IN ('starter', 'pro', 'free');

-- ============================================================================
-- 4) Vérification
-- ============================================================================

DO $$
DECLARE
  v_count_free INTEGER;
  v_count_starter INTEGER;
  v_count_pro INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count_free FROM public.profiles WHERE plan = 'free';
  SELECT COUNT(*) INTO v_count_starter FROM public.profiles WHERE plan = 'starter';
  SELECT COUNT(*) INTO v_count_pro FROM public.profiles WHERE plan = 'pro';

  RAISE NOTICE 'Migration complete - Profiles: free=%, starter=%, pro=%',
    v_count_free, v_count_starter, v_count_pro;
END $$;
