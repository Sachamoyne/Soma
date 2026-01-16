# Profiles Table Reset - Explanation

## Why the Previous Setup Was Broken

1. **Triggers on `auth.users`**: Attempts to auto-create profiles via database triggers caused signup failures. Triggers are hard to debug, can fail silently, and create timing issues.

2. **Confusing Schema**: The table had multiple migrations adding columns (`user_id`, `status`, `plan`, `role`, `email`, quota fields, Stripe fields) in an inconsistent order, making it unclear what the "source of truth" was.

3. **Duplicate/Conflicting RLS Policies**: Multiple policies with similar names ("Users can view their own profile", "Allow waitlist inserts", etc.) created confusion about which policy applied.

4. **Inconsistent Column Names**: Using `user_id` as primary key when it should match `auth.users.id` directly (`id`) was conceptually confusing.

5. **No Clear Profile Creation Flow**: Profile creation was supposed to happen via triggers, but when triggers failed, there was no fallback, leaving users without profiles.

## Why This New Setup Is Stable

1. **No Triggers**: Profile creation happens explicitly in application code (`src/app/login/page.tsx`), making it:
   - Easy to debug (errors appear in application logs)
   - Predictable (happens at a known point in the flow)
   - Testable (can be unit tested)
   - Non-blocking (auth doesn't fail if profile creation fails)

2. **Clean Schema**: 
   - Single primary key: `id` (matches `auth.users.id`)
   - Clear column names and purposes
   - All necessary fields in one place
   - Consistent naming convention

3. **Simple RLS Policies**: 
   - Only 3 policies with clear, descriptive names
   - `profiles_insert_own`: Users can insert their own profile
   - `profiles_select_own`: Users can read their own profile  
   - `profiles_update_own`: Users can update their own profile
   - No duplicate or conflicting policies

4. **Idempotent Profile Creation**: 
   - Uses `UPSERT` pattern (won't fail if profile already exists)
   - Called after both signup AND login (ensures profile exists)
   - Non-blocking (auth succeeds even if profile creation fails)

5. **Server-Side Enforcement**: 
   - `role` and `plan` are managed via service role client (bypasses RLS)
   - Application code enforces business rules
   - RLS provides basic access control, not business logic

## Where Profile Creation Happens and Why

### Location: `src/app/login/page.tsx`

**After Signup:**
```typescript
const { data: signInData } = await supabase.auth.signInWithPassword({...});
const user = signInData.user;
await ensureProfile(supabase, user.id, user.email);
```

**After Login:**
```typescript
const { data: signInData } = await supabase.auth.signInWithPassword({...});
const user = signInData.user;
if (user) {
  await ensureProfile(supabase, user.id, user.email);
}
```

### Why This Location?

1. **After Authentication**: Profile is created only after we know the user is authenticated and we have their `id` and `email`.

2. **Idempotent**: Uses `UPSERT` so calling it multiple times is safe (won't create duplicates).

3. **Non-Blocking**: Wrapped in try-catch, so authentication succeeds even if profile creation fails. The profile can be created later when needed.

4. **Explicit and Visible**: Unlike triggers, this code is visible in the application codebase, making it easy to:
   - Debug issues
   - Add logging
   - Modify behavior
   - Test

5. **Covers Both Flows**: Called after both signup and login, ensuring existing users without profiles get them created.

## Migration Steps

1. **Run the SQL migration**: `supabase/migrations/20250221_reset_profiles_clean.sql`
   - This drops the old table and recreates it with the clean schema
   - Removes all triggers
   - Sets up clean RLS policies

2. **Code is already updated**: 
   - Login page uses `ensureProfile()` function
   - All API routes use `id` instead of `user_id`
   - Profile creation is idempotent and non-blocking

3. **For existing users**: 
   - Profiles will be created automatically on their next login
   - Or can be created manually via SQL if needed

## Testing Checklist

- [ ] New user signup creates profile automatically
- [ ] Existing user login creates profile if missing
- [ ] Profile creation doesn't block authentication
- [ ] Multiple calls to `ensureProfile()` don't create duplicates
- [ ] API routes can read profiles using `id` (not `user_id`)
- [ ] RLS policies prevent users from accessing other users' profiles
- [ ] Server-side code can update `role` and `plan` via service role client
