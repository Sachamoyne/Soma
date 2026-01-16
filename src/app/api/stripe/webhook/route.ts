import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getStripe, PLANS, PlanName } from "@/lib/stripe";
import Stripe from "stripe";

// Disable body parsing - we need raw body for signature verification
export const runtime = "nodejs";

async function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase service configuration");
  }

  return createServiceClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function updateSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  planName: PlanName
) {
  const supabase = await getServiceSupabase();
  const plan = PLANS[planName];

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_id: subscription.id,
      subscription_status: subscription.status,
      plan_name: planName,
      ai_cards_monthly_limit: plan.aiCardsPerMonth,
      current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("[webhook] Failed to update subscription:", error);
    throw error;
  }
}

async function cancelSubscription(userId: string) {
  const supabase = await getServiceSupabase();

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_id: null,
      subscription_status: "canceled",
      plan_name: "free",
      ai_cards_monthly_limit: 0,
      current_period_end: null,
    })
    .eq("id", userId);

  if (error) {
    console.error("[webhook] Failed to cancel subscription:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("[webhook] Signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log("[webhook] Received event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const planName = session.metadata?.plan_name as PlanName;

        if (!userId || !planName) {
          console.error("[webhook] Missing metadata in checkout session");
          break;
        }

        if (session.subscription && typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription
          );
          await updateSubscription(userId, subscription, planName);
          console.log(
            "[webhook] Subscription activated for user:",
            userId,
            "plan:",
            planName
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        const planName = subscription.metadata?.plan_name as PlanName;

        if (!userId) {
          console.error("[webhook] Missing user ID in subscription metadata");
          break;
        }

        if (subscription.status === "active" && planName) {
          await updateSubscription(userId, subscription, planName);
          console.log("[webhook] Subscription updated for user:", userId);
        } else if (
          subscription.status === "canceled" ||
          subscription.status === "unpaid"
        ) {
          await cancelSubscription(userId);
          console.log("[webhook] Subscription canceled for user:", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (!userId) {
          console.error("[webhook] Missing user ID in subscription metadata");
          break;
        }

        await cancelSubscription(userId);
        console.log("[webhook] Subscription deleted for user:", userId);
        break;
      }

      default:
        console.log("[webhook] Unhandled event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
