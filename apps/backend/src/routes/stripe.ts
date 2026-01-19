import express, { Request, Response } from "express";
import Stripe from "stripe";

const router = express.Router();

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
 * No authentication required - payment happens before account creation.
 */
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    console.log("[STRIPE/CHECKOUT] Request received");

    // Validate request body
    const { plan } = req.body;

    if (!plan || (plan !== "starter" && plan !== "pro")) {
      return res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plan must be 'starter' or 'pro'",
      });
    }

    // Get price ID for the plan
    const priceIdMap: Record<"starter" | "pro", string | undefined> = {
      starter: process.env.SOMA_STARTER_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID,
      pro: process.env.SOMA_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID,
    };

    const priceId = priceIdMap[plan];

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

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${frontendUrl}/signup?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
      metadata: {
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
