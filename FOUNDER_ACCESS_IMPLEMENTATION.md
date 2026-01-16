# Founder/Admin AI Access Implementation

## Summary

The codebase already implements founder/admin AI access correctly. This document explains where AI access is checked and why the implementation is safe and scalable.

## Where AI Access is Checked

### 1. Server-Side (API Routes) - **PRIMARY ENFORCEMENT**

#### `src/app/api/generate-cards/route.ts` (Lines 287-333)
**Location**: Main AI card generation endpoint

**Logic**:
```typescript
const isPremium = plan === "starter" || plan === "pro";
const isFounderOrAdmin = role === "founder" || role === "admin";
const hasAIAccess = isPremium || isFounderOrAdmin;

// Founders/admins bypass quota checks
if (isFounderOrAdmin) {
  canGenerate = true;  // Unlimited access
} else if (used + estimatedCardCount <= limit) {
  canGenerate = true;  // Premium user within quota
}
```

**Key Features**:
- ✅ Founders/admins bypass quota entirely (line 324-326)
- ✅ Quota counter is NOT incremented for founders (line 422)
- ✅ Quota reset is skipped for founders (line 297)
- ✅ Server-side enforcement (cannot be bypassed)

#### `src/app/api/quota/route.ts` (Lines 109-131)
**Location**: Quota information endpoint

**Logic**:
```typescript
const isFounderOrAdmin = role === "founder" || role === "admin";
const hasAIAccess = isPremium || isFounderOrAdmin;

// For founders/admins, show unlimited quota
const remaining = isFounderOrAdmin ? 999999 : Math.max(0, limit - used);
const effectiveLimit = isFounderOrAdmin ? 999999 : limit;
```

**Key Features**:
- ✅ Returns `has_ai_access: true` for founders
- ✅ Shows unlimited quota (999999) for founders
- ✅ Used by frontend to enable/disable AI features

### 2. Frontend (UI Logic) - **UX ONLY**

#### `src/hooks/useUserPlan.ts` (Lines 16-53)
**Location**: React hook for user plan information

**Logic**:
```typescript
const canUseAI = has_ai_access;
```

**Key Features**:
- ✅ Uses `has_ai_access` from API (includes founders)
- ✅ Frontend components use this to enable/disable UI
- ✅ **Not security** - server-side checks are authoritative

#### Components Using `useUserPlan()`:
- `src/components/ImportDialog.tsx` - Disables AI generation button
- `src/app/(app)/decks/[deckId]/page.tsx` - Disables AI input/button
- `src/components/ImportsList.tsx` - Disables "Generate again" button

**Note**: These components also check `isFreeUser` based on plan, but they rely on `useUserPlan()` which already includes `has_ai_access`, so founders are correctly handled.

## Why This is Safe and Scalable

### 1. **Server-Side Enforcement**
- All AI access checks happen in API routes (`/api/generate-cards`, `/api/quota`)
- Frontend checks are for UX only - server always verifies
- Cannot be bypassed by modifying client code

### 2. **Role-Based, Not User-Based**
- Uses `role` column in database (not hardcoded user IDs)
- Easy to grant/revoke access by updating `role` in database
- Extensible: can add `admin`, `beta`, `tester` roles easily

### 3. **Quota Bypass is Explicit**
- Founders/admins explicitly bypass quota checks (line 324-326 in generate-cards)
- Quota counter is NOT incremented (line 422)
- Clear separation: premium users have quotas, founders don't

### 4. **No Billing Impact**
- Role changes don't affect Stripe subscriptions
- `plan` column remains unchanged (can still be 'free')
- Billing logic is separate from access control

### 5. **Idempotent and Reversible**
- Migration uses `WHERE email = '...'` (deterministic)
- Can be reversed: `UPDATE profiles SET role = 'user' WHERE email = '...'`
- Safe to run multiple times (only updates if not already founder)

## SQL Migration

**File**: `supabase/migrations/20250222_set_founder_role.sql`

**Usage**:
1. Replace `'YOUR_EMAIL@example.com'` with your actual email
2. Run the migration in Supabase SQL Editor
3. Migration is idempotent (safe to run multiple times)

**What it does**:
- Updates `role = 'founder'` for your email
- Does NOT affect billing/Stripe
- Does NOT affect other users
- Includes verification query to confirm update

## Testing Checklist

After running the migration:

- [ ] Profile shows `role = 'founder'` in database
- [ ] `/api/quota` returns `has_ai_access: true`
- [ ] `/api/quota` returns `limit: 999999` (unlimited)
- [ ] Can generate AI cards without quota errors
- [ ] Quota counter does NOT increment after generation
- [ ] Frontend shows AI features enabled
- [ ] No billing/Stripe changes

## Extending to Other Roles

To add more roles (e.g., `beta`, `tester`):

1. Update the CHECK constraint in migration:
   ```sql
   CHECK (role IN ('user', 'founder', 'admin', 'beta', 'tester'))
   ```

2. Update the condition in code:
   ```typescript
   const isFounderOrAdmin = role === "founder" || role === "admin" || role === "beta";
   ```

3. Or use a more scalable approach:
   ```typescript
   const privilegedRoles = ["founder", "admin", "beta", "tester"];
   const hasAIAccess = isPremium || privilegedRoles.includes(role);
   ```

## Security Notes

- ✅ **Server-side checks are authoritative** - Frontend can be modified but won't bypass server
- ✅ **RLS policies** - Users can only read/update their own profile
- ✅ **Role changes require database access** - Cannot be changed via API (only via service role)
- ✅ **No hardcoded user IDs** - All checks use role-based logic
