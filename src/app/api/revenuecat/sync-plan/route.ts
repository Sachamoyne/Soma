import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/revenuecat/sync-plan
 *
 * Updates the authenticated user's plan in Supabase after a RevenueCat
 * purchase or restore. The plan value is determined client-side from
 * RevenueCat entitlements and passed here as trusted input from an
 * authenticated session.
 *
 * Safety rules:
 *  - Requires valid Supabase JWT (auth.getUser())
 *  - Accepts only "free" | "starter" | "pro"
 *  - When downgrading to "free": skips if an active Stripe subscription
 *    already exists (prevents RC from wiping a Stripe subscriber's plan)
 *
 * Body: { plan: "free" | "starter" | "pro" }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body as { plan: unknown };

    if (plan !== "free" && plan !== "starter" && plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan value" }, { status: 400 });
    }

    // ── Guard: don't downgrade a Stripe-active subscriber to free ──────────
    // If RC shows no entitlements ("free"), but the user already has an
    // active Stripe subscription, leave their Supabase plan untouched.
    if (plan === "free") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, subscription_id")
        .eq("id", user.id)
        .maybeSingle();

      const hasStripeActive =
        profile?.subscription_status === "active" && Boolean(profile?.subscription_id);

      if (hasStripeActive) {
        console.log(
          `[rc-sync] Skipping free downgrade — active Stripe sub for user ${user.id}`
        );
        return NextResponse.json({ ok: true, plan: "skipped" });
      }
    }

    // ── Write the new plan ─────────────────────────────────────────────────
    // The DB trigger sync_ai_cards_quota_with_plan will automatically
    // update ai_cards_limit whenever `plan` changes.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        plan,
        plan_name: plan,
        subscription_status: plan === "free" ? null : "active",
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[rc-sync] Failed to update plan:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    console.log(`[rc-sync] Plan → ${plan} for user ${user.id}`);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("[rc-sync] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
