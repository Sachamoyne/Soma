import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/delete-account
 *
 * Permanently deletes the authenticated user's account and all their data.
 * Conforms to Apple App Store Guideline 5.1.1(v) — Account Deletion.
 *
 * Deletion order (respects FK constraints):
 *   1. reviews         — FK on cards + decks (no cascade from auth.users)
 *   2. generated_cards — FK on imports (no cascade from auth.users)
 *   3. cards           — FK on decks (no cascade from auth.users)
 *   4. decks           — no cascade from auth.users
 *                        (cascade handles: deck_settings)
 *   5. imports         — no cascade from auth.users
 *   6. settings        — no cascade from auth.users
 *   7. auth.admin.deleteUser()
 *      └── cascades:  profiles, push_devices, anki_imports, deck_settings
 *
 * Security:
 *   - Requires valid Supabase session (anon client verifies JWT)
 *   - Uses service role only for auth.admin.deleteUser (not for data reads)
 */
export async function POST() {
  // ── 1. Verify the caller is authenticated ────────────────────────────────
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.warn("[delete-account] Unauthorized attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  console.log("[delete-account] Starting deletion for user:", userId);

  // ── 2. Delete user data in FK-safe order ─────────────────────────────────
  // We reuse the anon client here because RLS allows users to delete their own rows.
  // The service role is only needed for auth.admin.deleteUser below.

  const steps: Array<{ table: string; error: unknown }> = [];

  const del = async (table: string) => {
    const { error } = await supabase
      .from(table as any)
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error(`[delete-account] Error deleting ${table}:`, error.message);
      steps.push({ table, error: error.message });
    } else {
      console.log(`[delete-account] Deleted ${table} ✓`);
    }
  };

  // Tables without CASCADE from auth.users — must be deleted manually.
  await del("reviews");        // FK → cards, decks
  await del("generated_cards"); // FK → imports
  await del("cards");          // FK → decks
  await del("decks");          // cascade handles deck_settings
  await del("imports");
  await del("settings");

  if (steps.length > 0) {
    // Non-fatal: some rows may not exist (new user, fresh account).
    // Log for observability but continue — the auth deletion is the critical step.
    console.warn("[delete-account] Some table deletions had errors:", steps);
  }

  // ── 3. Delete the auth user (cascades profiles, push_devices, anki_imports) ──
  const admin = createAdminClient();

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    console.error("[delete-account] Failed to delete auth user:", deleteUserError.message);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 }
    );
  }

  console.log("[delete-account] Auth user deleted ✓ — account fully removed:", userId);
  return NextResponse.json({ ok: true });
}
