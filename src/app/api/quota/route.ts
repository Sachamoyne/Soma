import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      .select("plan, role, ai_cards_used_current_month, ai_cards_monthly_limit, ai_quota_reset_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to fetch quota" },
        { status: 500 }
      );
    }

    if (!profile) {
      // Profile creation is owned by DB trigger logic. Do not create here.
      return NextResponse.json({
        plan: "free",
        role: "user",
        used: 0,
        limit: 0,
        remaining: 0,
        reset_at: null,
        has_ai_access: false,
        profile_ready: false,
      });
    }

    const resetAt = profile.ai_quota_reset_at
      ? new Date(profile.ai_quota_reset_at)
      : null;
    const now = new Date();
    if (resetAt && resetAt <= now) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const { error: resetError } = await supabase
        .from("profiles")
        .update({
          ai_cards_used_current_month: 0,
          ai_quota_reset_at: nextMonth.toISOString(),
        })
        .eq("id", user.id);

      if (!resetError) {
        profile.ai_cards_used_current_month = 0;
        profile.ai_quota_reset_at = nextMonth.toISOString();
      }
    }

    const plan = profile.plan || "free";
    const role = profile.role || "user";
    const used = profile.ai_cards_used_current_month || 0;
    const limit = profile.ai_cards_monthly_limit || 0;
    
    // Check if user has premium access (paid plan OR founder/admin role)
    const isPremium = plan === "starter" || plan === "pro";
    const isFounderOrAdmin = role === "founder" || role === "admin";
    const hasAIAccess = isPremium || isFounderOrAdmin;
    
    // For founders/admins, show unlimited quota
    const remaining = isFounderOrAdmin ? 999999 : Math.max(0, limit - used);
    const effectiveLimit = isFounderOrAdmin ? 999999 : limit;

    return NextResponse.json({
      plan: plan,
      role: role,
      used,
      limit: effectiveLimit,
      remaining,
      reset_at: profile.ai_quota_reset_at,
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
