-- ============================================================================
-- Migration: Synchroniser automatiquement ai_cards_monthly_limit avec plan
-- ============================================================================
-- PROBLEME RESOLU:
-- Quand un utilisateur paye (plan = 'starter' ou 'pro'), le champ
-- ai_cards_monthly_limit restait a 0 car il n'etait pas synchronise.
--
-- SOLUTION:
-- Trigger BEFORE INSERT OR UPDATE qui force ai_cards_monthly_limit selon le plan:
-- - free    -> 0
-- - starter -> 200
-- - pro     -> unlimited (INT sentinel)
-- ============================================================================

-- 1) Creer la fonction qui synchronise le quota avec le plan
CREATE OR REPLACE FUNCTION public.sync_ai_cards_quota_with_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Synchroniser ai_cards_monthly_limit selon le plan
  -- C'est la SOURCE DE VERITE UNIQUE pour les quotas
  CASE NEW.plan
    WHEN 'free' THEN
      NEW.ai_cards_monthly_limit := 0;
    WHEN 'starter' THEN
      NEW.ai_cards_monthly_limit := 200;
    WHEN 'pro' THEN
      NEW.ai_cards_monthly_limit := 2147483647;
    ELSE
      -- Fallback: si plan invalide, garder la valeur existante ou 0
      NEW.ai_cards_monthly_limit := COALESCE(NEW.ai_cards_monthly_limit, 0);
  END CASE;

  -- Initialiser ai_quota_reset_at si non defini
  IF NEW.ai_quota_reset_at IS NULL THEN
    NEW.ai_quota_reset_at := date_trunc('month', NOW()) + interval '1 month';
  END IF;

  -- Initialiser ai_cards_used_current_month si non defini
  IF NEW.ai_cards_used_current_month IS NULL THEN
    NEW.ai_cards_used_current_month := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS sync_ai_cards_quota_trigger ON public.profiles;

-- 3) Creer le trigger BEFORE INSERT OR UPDATE
-- BEFORE pour modifier les valeurs avant qu'elles soient ecrites
-- Note: On declenche sur TOUT update (pas juste plan) pour garantir la coherence
CREATE TRIGGER sync_ai_cards_quota_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ai_cards_quota_with_plan();

-- 4) BACKFILL: Corriger tous les profils existants avec un plan paye mais quota = 0
UPDATE public.profiles
SET
  ai_cards_monthly_limit = CASE plan
    WHEN 'starter' THEN 200
    WHEN 'pro' THEN 2147483647
    ELSE 0
  END
WHERE
  (plan IN ('starter', 'pro') AND (ai_cards_monthly_limit IS NULL OR ai_cards_monthly_limit = 0))
  OR (plan = 'free' AND ai_cards_monthly_limit != 0);

-- 5) Ajouter un commentaire pour la documentation
COMMENT ON FUNCTION public.sync_ai_cards_quota_with_plan() IS
  'Synchronise automatiquement ai_cards_monthly_limit avec le plan: free=0, starter=200, pro=unlimited (INT sentinel)';

-- 6) Verification: afficher les profils avec leur quota apres correction
-- (cette requete sera visible dans les logs de migration)
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
