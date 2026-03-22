import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS, FREE_TRIAL_LIMIT, getPlanLimit, serializePlanLimit } from "@/lib/plan-limits";

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

    // Only select columns that always exist (plan, role added in early migrations).
    // ai_free_trial_used is fetched separately so a pending migration doesn't
    // break this endpoint and lock out all free users.
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
        limit: FREE_TRIAL_LIMIT,
        remaining: FREE_TRIAL_LIMIT,
        has_ai_access: true,
        free_trial_used: 0,
        free_trial_limit: FREE_TRIAL_LIMIT,
        free_trial_remaining: FREE_TRIAL_LIMIT,
        profile_ready: false,
      });
    }

    const plan = (profile as any).plan || "free";
    const role = (profile as any).role || "user";

    const isPremium = plan === "starter" || plan === "pro";
    const isFounderOrAdmin = role === "founder" || role === "admin";

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

    // Free plan: use the free trial counter, not the card count.
    // Fetch ai_free_trial_used separately so that if the migration hasn't been
    // applied yet, we still return has_ai_access: true (trial starts at 0).
    if (!isPremium) {
      let freeTrialUsed = 0;
      const { data: trialRow, error: trialErr } = await supabase
        .from("profiles")
        .select("ai_free_trial_used")
        .eq("id", user.id)
        .maybeSingle();

      if (!trialErr && trialRow != null) {
        freeTrialUsed = ((trialRow as any).ai_free_trial_used as number) ?? 0;
      }
      // If trialErr (column not yet in DB): freeTrialUsed = 0 → full trial available

      const freeTrialRemaining = Math.max(0, FREE_TRIAL_LIMIT - freeTrialUsed);
      const hasAIAccess = freeTrialRemaining > 0;

      return NextResponse.json({
        plan,
        role,
        used: freeTrialUsed,
        limit: FREE_TRIAL_LIMIT,
        remaining: freeTrialRemaining,
        has_ai_access: hasAIAccess,
        free_trial_used: freeTrialUsed,
        free_trial_limit: FREE_TRIAL_LIMIT,
        free_trial_remaining: freeTrialRemaining,
        profile_ready: true,
      });
    }

    // Paid plan: count total cards for this user
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
      has_ai_access: true,
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
