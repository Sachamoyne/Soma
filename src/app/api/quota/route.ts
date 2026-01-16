import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile with service client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("plan, role, ai_cards_used_current_month, ai_cards_monthly_limit, ai_quota_reset_at")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to fetch quota" },
        { status: 500 }
      );
    }

    // Create default profile if doesn't exist
    if (!profile) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);

      // Try to get email from auth.users
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(user.id);
      const email = authUser?.user?.email || null;

      const { data: newProfile, error: createError } = await adminSupabase
        .from("profiles")
        .insert({
          id: user.id,
          email: email || "",
          role: "user",
          plan: "free",
          ai_cards_used_current_month: 0,
          ai_cards_monthly_limit: 0,
          ai_quota_reset_at: nextMonth.toISOString(),
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: "Failed to initialize profile" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        plan: newProfile.plan,
        used: newProfile.ai_cards_used_current_month,
        limit: newProfile.ai_cards_monthly_limit,
        remaining: 0,
        reset_at: newProfile.ai_quota_reset_at,
      });
    }

    // Check if quota needs reset
    const resetAt = new Date(profile.ai_quota_reset_at);
    const now = new Date();
    if (resetAt <= now) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const { error: resetError } = await adminSupabase
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
    });
  } catch (error) {
    console.error("[quota] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
