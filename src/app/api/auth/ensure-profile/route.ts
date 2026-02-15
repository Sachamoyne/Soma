import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/ensure-profile
 *
 * Called after OAuth sign-in to ensure the user's profile row exists.
 * Uses the service role key to bypass RLS for the upsert.
 * Preserves privileged roles (founder, admin) on existing profiles.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("[ensure-profile] Missing SUPABASE_URL or SERVICE_ROLE_KEY");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Preserve privileged roles while upserting.
    const { data: existingProfile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const privilegedRoles = ["founder", "admin"];
    const existingRole = existingProfile?.role;
    const shouldPreserveRole = existingRole && privilegedRoles.includes(existingRole);

    const { error: upsertError } = await adminSupabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        ...(shouldPreserveRole ? { role: existingRole } : { role: "user" }),
        plan: "free",
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

    if (upsertError) {
      console.error("[ensure-profile] Upsert error:", upsertError);
      return NextResponse.json({ error: "Profile upsert failed" }, { status: 500 });
    }

    console.info("[ensure-profile] Profile ensured for user:", user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ensure-profile] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
