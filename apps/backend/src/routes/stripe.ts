import express, { Request, Response } from "express";
import Stripe from "stripe";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const router = express.Router();

type Plan = "starter" | "pro";

// Initialize Stripe instance (lazy - only when needed)
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  stripeInstance = new Stripe(secretKey);

  return stripeInstance;
}

/**
 * POST /stripe/checkout
 * Creates a Stripe Checkout Session for subscription.
 * Requires authentication - account must be created before payment.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    console.log("[STRIPE/CHECKOUT] Request received");

    // User is authenticated by requireAuth middleware
    const userId = (req as any).userId;

    if (!userId) {
      console.error("[STRIPE/CHECKOUT] No valid user token");
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or missing authentication token",
      });
    }

    // Extract and type the plan from request body
    const { plan } = req.body as { plan?: Plan };

    // Validate plan is provided and is either "starter" or "pro"
    if (plan !== "starter" && plan !== "pro") {
      return res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plan must be 'starter' or 'pro'",
      });
    }

    // At this point, TypeScript knows plan is "starter" | "pro"
    // Define price ID mapping with strict typing
    const PRICE_IDS: Record<Plan, string | undefined> = {
      starter: process.env.SOMA_STARTER_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID,
      pro: process.env.SOMA_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID,
    };

    // Access price_id after validation - TypeScript knows plan is Plan
    const priceId = PRICE_IDS[plan];

    if (!priceId) {
      console.error(`[STRIPE/CHECKOUT] Missing price_id for plan: ${plan}`);
      return res.status(500).json({
        error: "MISSING_PRICE_ID",
        message: `Missing Stripe price_id for plan: ${plan}. Please configure SOMA_${plan.toUpperCase()}_PRICE_ID or STRIPE_${plan.toUpperCase()}_PRICE_ID environment variable.`,
      });
    }

    // Get frontend URL for success/cancel redirects
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      console.error("[STRIPE/CHECKOUT] Missing FRONTEND_URL");
      return res.status(500).json({
        error: "MISSING_CONFIGURATION",
        message: "FRONTEND_URL environment variable is not set",
      });
    }

    // Initialize Stripe
    const stripe = getStripe();

    // Get or create Stripe customer for the user
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("[STRIPE/CHECKOUT] Missing Supabase configuration");
      return res.status(500).json({
        error: "MISSING_CONFIGURATION",
        message: "Supabase configuration not set",
      });
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get user profile to check for existing Stripe customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", userId)
      .single();

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
      success_url: `${frontendUrl}/decks?checkout=success`,
      cancel_url: `${frontendUrl}/onboarding?plan=${plan}&canceled=1`,
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

export default router;
