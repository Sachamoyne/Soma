# Auto-Create Profiles on Signup + Founder/Admin AI Access

## Problem Diagnosed

**Root Cause**: The `profiles` table exists but no trigger was creating rows automatically on user signup. Only the `settings` table was being auto-created.

## Solution Implemented

### 1. SQL Migration (`supabase/migrations/20250220_auto_create_profiles_and_role.sql`)

This migration:
- ✅ Adds `role` column (default: 'user', can be 'founder' or 'admin')
- ✅ Adds `email` column (synced from auth.users)
- ✅ Creates trigger function `handle_new_user()` that auto-creates both `settings` and `profiles` on signup
- ✅ Updates RLS policies to allow profile insertion
- ✅ Creates index on `role` for faster queries

**To apply this migration:**
1. Go to Supabase Dashboard → SQL Editor
2. Run the migration file: `supabase/migrations/20250220_auto_create_profiles_and_role.sql`

### 2. AI Access Logic Updated

AI access is now granted if **any** of these conditions are met:
- `plan === 'starter'` OR `plan === 'pro'` (paying users)
- `role === 'founder'` OR `role === 'admin'` (internal users)

**Files modified:**
- ✅ `src/app/api/generate-cards/route.ts` - Server-side AI access check
- ✅ `src/app/api/quota/route.ts` - Quota API returns `has_ai_access` and `role`
- ✅ `src/hooks/useUserPlan.ts` - Frontend hook uses `has_ai_access` flag

### 3. Founder/Admin Privileges

Founders and admins have:
- ✅ Unlimited AI card generation (quota bypass)
- ✅ No quota increment (quota counter not incremented for them)
- ✅ Access granted server-side (cannot be bypassed client-side)

## How to Grant Founder/Admin Role

To grant a user founder or admin role, update the `profiles` table in Supabase:

```sql
-- Grant founder role to a user (replace USER_EMAIL with actual email)
UPDATE profiles
SET role = 'founder'
WHERE email = 'USER_EMAIL';

-- Or grant admin role
UPDATE profiles
SET role = 'admin'
WHERE email = 'USER_EMAIL';

-- Or grant via user_id (if you know the UUID)
UPDATE profiles
SET role = 'founder'
WHERE user_id = 'USER_UUID';
```

## Testing Checklist

After applying the migration:

1. ✅ **Test new signup**: Create a new user and verify:
   - Profile row is created automatically in `profiles` table
   - `role` = 'user', `plan` = 'free', `email` matches auth.users.email

2. ✅ **Test founder access**: 
   - Update a user's `role` to 'founder' in database
   - Verify they can generate AI cards (no quota check)
   - Verify quota counter doesn't increment for them

3. ✅ **Test admin access**: Same as founder

4. ✅ **Test free user**: Verify free users are still blocked from AI

5. ✅ **Test paid users**: Verify starter/pro users work as before

## Security Notes

- ✅ **Server-side enforcement**: All AI access checks are done server-side in API routes
- ✅ **RLS policies**: Updated to allow trigger to insert profiles (SECURITY DEFINER function bypasses RLS anyway)
- ✅ **No client-side bypass**: Frontend checks are for UX only; backend always verifies

## Database Schema Changes

```sql
-- New columns in profiles table:
- role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'founder', 'admin'))
- email TEXT

-- New trigger:
- on_auth_user_created → executes handle_new_user()

-- New function:
- handle_new_user() → creates both settings and profiles on signup
```

## Migration Order

Make sure this migration runs **after**:
- ✅ `20260301_add_profiles_waitlist.sql` (creates profiles table)
- ✅ `20250115_add_pricing_quotas.sql` (adds plan column)

The migration file name `20250220_*` ensures it runs in chronological order.
