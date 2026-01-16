-- ============================================================================
-- Migration: Set founder role for specific user
-- ============================================================================
-- This migration sets the 'founder' role for a specific user account.
-- Founders have unlimited AI access without paying.
--
-- IMPORTANT: Replace 'YOUR_EMAIL@example.com' with your actual email address
-- before running this migration.
-- ============================================================================

-- Update profile to set founder role
-- This is safe because:
-- 1. Only updates the specific user identified by email
-- 2. Does not affect billing/Stripe (only changes role)
-- 3. Reversible (can set role back to 'user' if needed)
UPDATE profiles
SET role = 'founder'
WHERE email = 'YOUR_EMAIL@example.com'  -- ⚠️ REPLACE WITH YOUR EMAIL
  AND role != 'founder';  -- Only update if not already founder (idempotent)

-- Verify the update (optional - comment out if you don't want output)
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count = 0 THEN
    RAISE NOTICE 'No profile found with email "YOUR_EMAIL@example.com". Please verify the email address.';
  ELSIF updated_count = 1 THEN
    RAISE NOTICE 'Successfully set founder role for user.';
  ELSE
    RAISE WARNING 'Unexpected: Updated % rows. Expected exactly 1.', updated_count;
  END IF;
END $$;

-- Show the updated profile (for verification)
SELECT 
  id,
  email,
  role,
  plan,
  created_at
FROM profiles
WHERE email = 'YOUR_EMAIL@example.com'  -- ⚠️ REPLACE WITH YOUR EMAIL
LIMIT 1;
