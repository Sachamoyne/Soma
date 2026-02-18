import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS, getPlanLimit, serializePlanLimit } from "@/lib/plan-limits";

const SERIALIZED_UNLIMITED_LIMIT = serializePlanLimit(PLAN_LIMITS.pro);

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to fetch quota" },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json({
        plan: "free",
        role: "user",
        used: 0,
        limit: 0,
        remaining: 0,
        has_ai_access: false,
        profile_ready: false,
      });
    }

    const plan = profile.plan || "free";
    const role = profile.role || "user";

    const isPremium = plan === "starter" || plan === "pro";
    const isFounderOrAdmin = role === "founder" || role === "admin";
    const hasAIAccess = isPremium || isFounderOrAdmin;

    // For founders/admins, show unlimited quota
    if (isFounderOrAdmin) {
      return NextResponse.json({
        plan,
        role,
        used: 0,
        limit: SERIALIZED_UNLIMITED_LIMIT,
        remaining: SERIALIZED_UNLIMITED_LIMIT,
        has_ai_access: true,
        profile_ready: true,
      });
    }

    // Count total cards for this user
    const { count: totalCards, error: countError } = await supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      return NextResponse.json(
        { error: "Failed to count cards" },
        { status: 500 }
      );
    }

    const used = totalCards || 0;
    const limit = getPlanLimit(plan);
    const serializedLimit = serializePlanLimit(limit);
    const remaining = Math.max(0, limit - used);
    const serializedRemaining = serializePlanLimit(remaining);

    return NextResponse.json({
      plan,
      role,
      used,
      limit: serializedLimit,
      remaining: serializedRemaining,
      has_ai_access: hasAIAccess,
      profile_ready: true,
    });
  } catch (error) {
    console.error("[quota] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
