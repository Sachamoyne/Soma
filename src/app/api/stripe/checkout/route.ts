import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({
  plan: z.enum(["starter", "pro"]),
});

// Price ID getters by plan
function getPriceId(plan: "starter" | "pro"): string | undefined {
  if (plan === "starter") {
    return process.env.STRIPE_STARTER_PRICE_ID;
  }
  if (plan === "pro") {
    return process.env.STRIPE_PRO_PRICE_ID;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plan } = requestSchema.parse(body);

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get price ID for the plan
    const priceId = getPriceId(plan);

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID not configured for this plan" },
        { status: 500 }
      );
    }

    // Get base URL from request headers
    const origin = request.headers.get("origin") || "http://localhost:3000";

    // Initialize Stripe (lazy, inside request handler)
    const stripe = getStripe();

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
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
      success_url: `${origin}/decks?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_name: plan,
        },
      },
      metadata: {
        supabase_user_id: user.id,
        plan_name: plan,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Validation error: ${error.message}` },
        { status: 400 }
      );
    }
    console.error("[stripe/checkout] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
