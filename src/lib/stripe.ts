// Server-only Stripe utility.
// IMPORTANT: This file must ONLY be imported in:
// - app/api/route.ts files (API routes)
// - Other server-only code
// NEVER import this in client components or shared utilities.
import Stripe from "stripe";

// Lazy initialization - only creates Stripe instance when needed
// This prevents build-time errors if env vars are missing
let stripeInstance: Stripe | null = null;

/**
 * Returns the Stripe instance. Must be called inside a request handler.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
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

// Plan configuration
export const PLANS = {
  free: {
    name: "Free",
    priceId: null,
    aiCardsPerMonth: 0,
    priceEuros: 0,
  },
  starter: {
    name: "Starter",
    priceId: () => process.env.STRIPE_STARTER_PRICE_ID,
    aiCardsPerMonth: 800,
    priceEuros: 8,
  },
  pro: {
    name: "Pro",
    priceId: () => process.env.STRIPE_PRO_PRICE_ID,
    aiCardsPerMonth: 2500,
    priceEuros: 15,
  },
  organization: {
    name: "Organization",
    priceId: null,
    aiCardsPerMonth: -1, // unlimited
    priceEuros: null, // contact only
  },
} as const;

export type PlanName = keyof typeof PLANS;
