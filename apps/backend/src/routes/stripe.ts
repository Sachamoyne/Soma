import express, { Request, Response } from "express";
// @ts-ignore stripe types may be missing in local env; present in prod deps
import Stripe from "stripe";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth";
import { getEnv } from "../env";

// ============================================================================
// LOCAL TYPE DEFINITIONS FOR SUPABASE TABLES
// These types are manually maintained to match DB schema (see migrations).
// ============================================================================

/** Affiliate record from the affiliates table */
interface Affiliate {
  id: string;
  name: string;
  slug: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Affiliate conversion record for the affiliate_conversions table */
interface AffiliateConversionInsert {
  affiliate_id: string;
  user_id: string;
  stripe_checkout_session_id: string;
  stripe_subscription_id: string | null;
  amount_paid_cents: number;
  discount_cents: number;
  commission_percent: number;
  commission_cents: number;
}

/** Profile record from the profiles table */
interface Profile {
  id: string;
  email: string | null;
  role: string | null;
  plan: string | null;
  plan_name: string | null;
  stripe_customer_id: string | null;
  onboarding_status: string | null;
  subscription_status: string | null;
  ai_cards_monthly_limit: number | null;
  ai_cards_used_current_month: number | null;
  ai_quota_reset_at: string | null;
}

const router = express.Router();

type Plan = "starter" | "pro";

// Initialize Stripe instance (lazy - only when needed)
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const env = getEnv();
  const secretKey = env.STRIPE_SECRET_KEY;

  stripeInstance = new Stripe(secretKey);

  return stripeInstance;
}

/**
 * POST /stripe/checkout
 * Creates a Stripe Checkout Session for the authenticated user.
 */
router.post("/checkout", requireAuth, async (req: Request, res: Response) => {
  try {
    console.log("[STRIPE/CHECKOUT] Request received");

    const userId = (req as any).userId as string | undefined;

    if (!userId) {
      console.error("[STRIPE/CHECKOUT] No valid user token");
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "User must be authenticated",
      });
    }

    const body = req.body as { plan?: unknown } | undefined;
    const rawPlan = body?.plan;

    if (rawPlan !== "starter" && rawPlan !== "pro") {
      return res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plan must be 'starter' or 'pro'",
      });
    }
    const plan: Plan = rawPlan;

    const env = getEnv();
    const PRICE_IDS: Record<Plan, string | undefined> = {
      starter: env.STRIPE_STARTER_PRICE_ID,
      pro: env.STRIPE_PRO_PRICE_ID,
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      console.error(`[STRIPE/CHECKOUT] Missing price_id for plan: ${plan}`);
      return res.status(500).json({
        error: "MISSING_PRICE_ID",
        message: `Missing Stripe price_id for plan: ${plan}`,
      });
    }

    const stripe = getStripe();
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id, onboarding_status, subscription_status, plan_name")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("[STRIPE/CHECKOUT] Profile lookup failed:", profileError);
      return res.status(404).json({
        error: "PROFILE_NOT_FOUND",
        message: "Profile not found. Please retry after account provisioning.",
      });
    }

    // Prevent double payment if already active
    const onboardingStatus = (profile as any)?.onboarding_status as string | null | undefined;
    const legacySubscriptionStatus = (profile as any)?.subscription_status as string | null | undefined;
    if (onboardingStatus === "active" || legacySubscriptionStatus === "active") {
      return res.status(409).json({
        error: "ALREADY_ACTIVE",
        message: "Subscription already active",
      });
    }

    let customerId = profile?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || undefined,
        metadata: {
          supabase_user_id: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${env.FRONTEND_URL}/post-checkout?checkout=success`,
      cancel_url: `${env.FRONTEND_URL}/pricing`,
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          plan_name: plan,
        },
      },
      metadata: {
        supabase_user_id: userId,
        plan_name: plan,
      },
    });

    if (!session.url) {
      console.error("[STRIPE/CHECKOUT] Stripe session created but URL is missing");
      return res.status(500).json({
        error: "STRIPE_ERROR",
        message: "Failed to create checkout session URL",
      });
    }

    console.log(`[STRIPE/CHECKOUT] Session created: ${session.id} for plan: ${plan}`);
    return res.json({ url: session.url });
  } catch (error) {
    console.error("[STRIPE/CHECKOUT] Error:", error);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

/**
 * POST /stripe/portal
 * Creates a Stripe Customer Portal session for the authenticated user.
 * This route is strictly for managing existing subscriptions.
 */
router.post("/portal", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string | undefined;

    if (!userId) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "User must be authenticated",
      });
    }

    const env = getEnv();
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    const customerId = profile?.stripe_customer_id;

    if (!customerId) {
      console.warn(`[STRIPE/PORTAL] Missing stripe_customer_id for user: ${userId}`);
      return res.status(400).json({
        error: "NO_STRIPE_CUSTOMER",
        message: "No Stripe customer found for this user",
      });
    }

    const stripe = getStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.FRONTEND_URL}/billing`,
    });

    if (!session.url) {
      console.error("[STRIPE/PORTAL] Portal session created but URL is missing");
      return res.status(500).json({
        error: "STRIPE_ERROR",
        message: "Failed to create portal session URL",
      });
    }

    console.log(`[STRIPE/PORTAL] Portal session created: ${session.id} for user: ${userId}`);
    return res.json({ url: session.url });
  } catch (error) {
    console.error("[STRIPE/PORTAL] Error:", error);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

// ============================================================================
// AFFILIATE TRACKING HELPERS
// ============================================================================

/**
 * Extract promotion code ID from a Checkout Session
 * Returns the Stripe promotion_code ID if a promo was used, null otherwise
 */
async function extractPromotionCodeFromSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<string | null> {
  try {
    // Method 1: Check session.total_details.breakdown.discounts (if available)
    const totalDetails = session.total_details as any;
    if (totalDetails?.breakdown?.discounts?.length > 0) {
      const discount = totalDetails.breakdown.discounts[0];
      if (discount.discount?.promotion_code) {
        return discount.discount.promotion_code as string;
      }
    }

    // Method 2: Retrieve the subscription and check its discount
    const subscriptionId = session.subscription as string | null;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['discount.promotion_code'],
      });

      if (subscription.discount?.promotion_code) {
        const promoCode = subscription.discount.promotion_code;
        // Can be string ID or expanded object
        if (typeof promoCode === 'string') {
          return promoCode;
        } else {
          return promoCode.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[STRIPE/WEBHOOK] Error extracting promotion code:', error);
    return null;
  }
}

/**
 * Record an affiliate conversion (idempotent - uses session ID as unique key)
 * Non-blocking: errors are logged but do not fail the webhook
 */
async function recordAffiliateConversion(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  promotionCodeId: string,
  userId: string
): Promise<void> {
  try {
    // 1. Look up affiliate by stripe_promotion_code_id
    const { data: affiliateData, error: affiliateError } = await supabase
      .from('affiliates')
      .select('id, name, commission_percent')
      .eq('stripe_promotion_code_id', promotionCodeId)
      .eq('is_active', true)
      .single();

    // Cast to typed interface (Supabase returns unknown without generated types)
    const affiliate = affiliateData as Affiliate | null;

    if (affiliateError || !affiliate) {
      // No affiliate found - might be a non-affiliate coupon, which is fine
      console.log(`[STRIPE/WEBHOOK] No affiliate found for promo code ${promotionCodeId} - skipping attribution`);
      return;
    }

    // 2. Calculate amounts
    const amountTotal = session.amount_total || 0;      // Amount paid in cents (after discount)
    const amountSubtotal = session.amount_subtotal || 0; // Original amount before discount
    const discountAmount = Math.max(0, amountSubtotal - amountTotal);
    const commissionCents = Math.round(amountTotal * (affiliate.commission_percent / 100));

    // 3. Insert conversion (idempotent via UNIQUE constraint on stripe_checkout_session_id)
    const conversionData: AffiliateConversionInsert = {
      affiliate_id: affiliate.id,
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: session.subscription as string | null,
      amount_paid_cents: amountTotal,
      discount_cents: discountAmount,
      commission_percent: affiliate.commission_percent,
      commission_cents: commissionCents,
    };

    const { error: insertError } = await supabase
      .from('affiliate_conversions')
      .upsert(conversionData as any, {
        onConflict: 'stripe_checkout_session_id',
        ignoreDuplicates: true,  // Don't error on duplicate, just skip
      });

    if (insertError) {
      console.error('[STRIPE/WEBHOOK] Error inserting affiliate conversion:', insertError);
      return;
    }

    console.log(`[STRIPE/WEBHOOK] ✅ Affiliate conversion recorded: affiliate=${affiliate.name}, user=${userId}, amount=${amountTotal / 100}€, commission=${commissionCents / 100}€`);
  } catch (error) {
    console.error('[STRIPE/WEBHOOK] Error recording affiliate conversion:', error);
    // Don't throw - affiliate tracking failure should not fail the webhook
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * POST /stripe/webhook
 * Stripe sends checkout.session.completed here.
 * We verify the signature and then activate the user's onboarding status.
 *
 * IMPORTANT: this handler MUST be wired with express.raw({ type: "application/json" }) in index.ts.
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const env = getEnv();
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      console.error("[STRIPE/WEBHOOK] Missing stripe-signature header");
      return res.status(400).send("Missing signature");
    }

    // req.body is a Buffer because of express.raw()
    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const supabaseUserId =
      (session.metadata?.supabase_user_id as string | undefined) ||
      ((session.subscription as any)?.metadata?.supabase_user_id as string | undefined);
    const planName = session.metadata?.plan_name as Plan | undefined;

    if (!supabaseUserId) {
      console.error("[STRIPE/WEBHOOK] Missing supabase_user_id in metadata");
      return res.status(400).send("Missing supabase_user_id");
    }

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // CRITICAL: Validate planName - must be starter or pro for paid checkout
    let finalPlan: Plan = "starter"; // Default fallback
    if (planName === "starter" || planName === "pro") {
      finalPlan = planName;
    } else {
      console.warn(`[STRIPE/WEBHOOK] Invalid or missing plan_name in session metadata: ${planName}`);
      // Try to get plan from subscription metadata as fallback
      const subscriptionId = session.subscription as string | null;
      if (subscriptionId) {
        try {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const subPlan = subscription.metadata?.plan_name as Plan | undefined;
          if (subPlan === "starter" || subPlan === "pro") {
            finalPlan = subPlan;
            console.log(`[STRIPE/WEBHOOK] Found plan in subscription metadata: ${subPlan}`);
          }
        } catch (err) {
          console.error("[STRIPE/WEBHOOK] Failed to retrieve subscription:", err);
        }
      }
    }

    console.log(`[STRIPE/WEBHOOK] Activating user ${supabaseUserId} with plan: ${finalPlan}`);

    const { data: existingProfileData, error: profileLookupError } = await supabase
      .from("profiles")
      .select("stripe_customer_id, role, ai_cards_monthly_limit, ai_cards_used_current_month, ai_quota_reset_at")
      .eq("id", supabaseUserId)
      .single();

    if (profileLookupError || !existingProfileData) {
      console.error("[STRIPE/WEBHOOK] Missing profile for user:", supabaseUserId, profileLookupError);
      // Trigger-owned profile provisioning should have created this row.
      // Return 500 so Stripe retries instead of silently losing activation.
      return res.status(500).send("Profile not ready");
    }

    const existingProfile = existingProfileData as Partial<Profile>;
    const profileData: Record<string, unknown> = {
      plan: finalPlan,
      plan_name: finalPlan,
      onboarding_status: "active",
      subscription_status: "active",
    };

    if (
      existingProfile.ai_cards_used_current_month !== null &&
      existingProfile.ai_cards_used_current_month !== undefined
    ) {
      profileData.ai_cards_used_current_month = existingProfile.ai_cards_used_current_month;
    }
    if (!existingProfile.ai_quota_reset_at) {
      const nextMonthReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
      profileData.ai_quota_reset_at = nextMonthReset.toISOString();
    }
    if (existingProfile.stripe_customer_id) {
      profileData.stripe_customer_id = existingProfile.stripe_customer_id;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profileData as any)
      .eq("id", supabaseUserId);

    if (updateError) {
      console.error("[STRIPE/WEBHOOK] Failed to update profile:", updateError);
      return res.status(500).send("Failed to update profile");
    }

    console.log(`[STRIPE/WEBHOOK] Successfully activated user ${supabaseUserId} with plan ${finalPlan}`);

    // --- AFFILIATE TRACKING (non-blocking) ---
    try {
      const promotionCodeId = await extractPromotionCodeFromSession(stripe, session);

      if (promotionCodeId) {
        console.log(`[STRIPE/WEBHOOK] Promotion code detected: ${promotionCodeId}`);
        await recordAffiliateConversion(supabase, stripe, session, promotionCodeId, supabaseUserId);
      } else {
        console.log(`[STRIPE/WEBHOOK] No promotion code used for this checkout`);
      }
    } catch (affiliateError) {
      // Log but don't fail the webhook - affiliate tracking is not critical
      console.error('[STRIPE/WEBHOOK] Affiliate tracking error (non-fatal):', affiliateError);
    }
    // --- END AFFILIATE TRACKING ---

    return res.json({ received: true });
  } catch (error) {
    console.error("[STRIPE/WEBHOOK] Error:", error);
    return res.status(400).send("Webhook Error");
  }
}

export default router;
