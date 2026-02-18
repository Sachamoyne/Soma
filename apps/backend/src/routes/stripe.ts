import express, { Request, Response } from "express";
// @ts-ignore stripe types may be missing in local env; present in prod deps
import Stripe from "stripe";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth";
import { getEnv } from "../env";
import { isPaidPlan, type PaidPlanName } from "../lib/plan-limits";

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
  subscription_id: string | null;
  current_period_end: string | null;
  ai_cards_monthly_limit: number | null;
  ai_cards_used_current_month: number | null;
  ai_quota_reset_at: string | null;
}

const router = express.Router();

type Plan = PaidPlanName;

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
      .select("email, stripe_customer_id, subscription_status, plan_name, plan")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("[STRIPE/CHECKOUT] Profile lookup failed:", profileError);
      return res.status(404).json({
        error: "PROFILE_NOT_FOUND",
        message: "Profile not found. Please retry after account provisioning.",
      });
    }

    // Prevent double payment only for already-active paid subscriptions.
    const subscriptionStatus = (profile as any)?.subscription_status as string | null | undefined;
    const planName = (profile as any)?.plan_name as string | null | undefined;
    const planFallback = (profile as any)?.plan as string | null | undefined;
    const currentPaidPlan = isPaidPlan(planName) ? planName : isPaidPlan(planFallback) ? planFallback : null;
    if (subscriptionStatus === "active" && currentPaidPlan) {
      return res.status(409).json({
        error: "ALREADY_ACTIVE",
        message: "Subscription already active",
      });
    }

    console.log("[STRIPE/CHECKOUT] Starting checkout", {
      userId,
      requestedPlan: plan,
      subscriptionStatus,
      currentPaidPlan,
    });

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
      success_url: `${env.FRONTEND_URL}/billing?checkout=success`,
      cancel_url: `${env.FRONTEND_URL}/billing`,
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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);

function resolvePlanFromPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) {
    return null;
  }

  const env = getEnv();
  if (priceId === env.STRIPE_STARTER_PRICE_ID) {
    return "starter";
  }
  if (priceId === env.STRIPE_PRO_PRICE_ID) {
    return "pro";
  }
  return null;
}

function resolvePlanFromSubscription(subscription: Stripe.Subscription): Plan | null {
  const metadataPlan = subscription.metadata?.plan_name;
  if (isPaidPlan(metadataPlan)) {
    return metadataPlan;
  }

  const firstPriceId = subscription.items.data[0]?.price?.id;
  return resolvePlanFromPriceId(firstPriceId);
}

function resolveSubscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const periodEnd = subscription.current_period_end;
  if (!periodEnd) {
    return null;
  }
  return new Date(periodEnd * 1000).toISOString();
}

async function resolveSupabaseUserIdFromSubscription(
  stripe: Stripe,
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metadataUserId = subscription.metadata?.supabase_user_id;
  if (metadataUserId) {
    return metadataUserId;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) {
    return null;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      const customerMetadataUserId = customer.metadata?.supabase_user_id;
      if (customerMetadataUserId) {
        return customerMetadataUserId;
      }
    }
  } catch (error) {
    console.warn("[STRIPE/WEBHOOK] Failed to read customer metadata:", error);
  }

  const { data: profileByCustomer, error: profileByCustomerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (profileByCustomerError) {
    console.warn("[STRIPE/WEBHOOK] Failed to resolve user by stripe_customer_id:", profileByCustomerError);
    return null;
  }

  return (profileByCustomer as { id?: string } | null)?.id ?? null;
}

async function upsertProfileFromSubscriptionEvent(
  supabase: SupabaseClient,
  userId: string,
  subscription: Stripe.Subscription
): Promise<{ ok: boolean; reason?: string }> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  const periodEndIso = resolveSubscriptionPeriodEnd(subscription);
  const status = subscription.status;
  const plan = resolvePlanFromSubscription(subscription);

  console.log("[STRIPE/WEBHOOK] Subscription event resolved", {
    userId,
    subscriptionId: subscription.id,
    status,
    plan,
    customerId,
  });

  const shouldActivate = ACTIVE_SUBSCRIPTION_STATUSES.has(status) && Boolean(plan);
  const updatePayload: Record<string, unknown> = {
    stripe_customer_id: customerId ?? null,
    subscription_id: subscription.id,
    current_period_end: periodEndIso,
  };

  if (shouldActivate && plan) {
    updatePayload.plan = plan;
    updatePayload.plan_name = plan;
    updatePayload.subscription_status = "active";
    updatePayload.onboarding_status = "active";
  } else {
    updatePayload.plan = "free";
    updatePayload.plan_name = "free";
    updatePayload.subscription_status =
      status === "canceled" || status === "unpaid" || status === "incomplete_expired"
        ? "canceled"
        : "pending_payment";
    updatePayload.onboarding_status = "active";
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(updatePayload as any)
    .eq("id", userId);

  if (updateError) {
    console.error("[STRIPE/WEBHOOK] Failed to update profile from subscription event:", updateError);
    return { ok: false, reason: "profile_update_failed" };
  }

  console.log("[STRIPE/WEBHOOK] Profile synced from subscription", {
    userId,
    subscriptionId: subscription.id,
    profilePlan: updatePayload.plan,
    subscriptionStatus: updatePayload.subscription_status,
  });

  return { ok: true };
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * POST /stripe/webhook
 * Stripe sends subscription lifecycle events here.
 * Plan activation/downgrade is derived only from customer.subscription.* events.
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

    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("[STRIPE/WEBHOOK] Event received", { type: event.type, id: event.id });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const supabaseUserId = session.metadata?.supabase_user_id as string | undefined;

      console.log("[STRIPE/WEBHOOK] checkout.session.completed", {
        sessionId: session.id,
        supabaseUserId: supabaseUserId ?? null,
        planName: session.metadata?.plan_name ?? null,
      });

      // Affiliate tracking is attached to completed checkout, but it must not
      // grant paid plan access. Access is handled by customer.subscription.*.
      if (supabaseUserId) {
        try {
          const promotionCodeId = await extractPromotionCodeFromSession(stripe, session);
          if (promotionCodeId) {
            await recordAffiliateConversion(supabase, stripe, session, promotionCodeId, supabaseUserId);
          }
        } catch (affiliateError) {
          console.error("[STRIPE/WEBHOOK] Affiliate tracking error (non-fatal):", affiliateError);
        }
      } else {
        console.warn("[STRIPE/WEBHOOK] Missing supabase_user_id on checkout session metadata");
      }

      return res.json({ received: true });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveSupabaseUserIdFromSubscription(stripe, supabase, subscription);

      if (!userId) {
        console.error("[STRIPE/WEBHOOK] Unable to resolve supabase user for subscription", {
          subscriptionId: subscription.id,
          customer:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id,
        });
        return res.status(400).send("Unable to resolve user");
      }

      const { data: profile, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (profileLookupError || !profile) {
        console.error("[STRIPE/WEBHOOK] Profile missing for subscription event", {
          userId,
          subscriptionId: subscription.id,
          profileLookupError,
        });
        return res.status(500).send("Profile not ready");
      }

      const syncResult = await upsertProfileFromSubscriptionEvent(supabase, userId, subscription);
      if (!syncResult.ok) {
        return res.status(500).send(syncResult.reason ?? "Profile sync failed");
      }

      return res.json({ received: true });
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("[STRIPE/WEBHOOK] Error:", error);
    return res.status(400).send("Webhook Error");
  }
}

export default router;
