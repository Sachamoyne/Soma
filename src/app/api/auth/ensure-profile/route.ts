import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/ensure-profile
 *
 * Read-only health check for profile provisioning.
 * Profile creation is owned by DB trigger logic.
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

    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[ensure-profile] Failed to query profile:", profileError);
      return NextResponse.json({ error: "Profile lookup failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      exists: Boolean(existingProfile),
      message: existingProfile
        ? "Profile exists"
        : "Profile provisioning is still in progress",
    });
  } catch (err) {
    console.error("[ensure-profile] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
