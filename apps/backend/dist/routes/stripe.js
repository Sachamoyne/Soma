"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = handleStripeWebhook;
const express_1 = __importDefault(require("express"));
// @ts-ignore stripe types may be missing in local env; present in prod deps
const stripe_1 = __importDefault(require("stripe"));
const supabase_js_1 = require("@supabase/supabase-js");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Initialize Stripe instance (lazy - only when needed)
let stripeInstance = null;
function getStripe() {
    if (stripeInstance) {
        return stripeInstance;
    }
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeInstance = new stripe_1.default(secretKey);
    return stripeInstance;
}
/**
 * POST /stripe/checkout
 * Creates a Stripe Checkout Session for subscription.
 * Supports:
 * - Authenticated calls (Authorization header via requireAuth middleware)
 * - Unauthenticated calls if userId is provided (for paid onboarding before email confirmation)
 */
router.post("/checkout", async (req, res) => {
    try {
        console.log("[STRIPE/CHECKOUT] Request received");
        // If requireAuth is enabled, userId is injected by middleware.
        // Otherwise we allow passing userId explicitly for paid onboarding.
        const authedUserId = req.userId;
        const bodyUserId = req.body?.userId;
        const userId = authedUserId || bodyUserId;
        if (!userId) {
            console.error("[STRIPE/CHECKOUT] No valid user token");
            return res.status(401).json({
                error: "Unauthorized",
                message: "Missing userId",
            });
        }
        // Extract and type the plan from request body
        const { plan } = req.body;
        // Validate plan is provided and is either "starter" or "pro"
        if (plan !== "starter" && plan !== "pro") {
            return res.status(400).json({
                error: "INVALID_PLAN",
                message: "Plan must be 'starter' or 'pro'",
            });
        }
        // At this point, TypeScript knows plan is "starter" | "pro"
        // Define price ID mapping with strict typing
        const PRICE_IDS = {
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
        const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        // Get user profile to check for existing Stripe customer ID
        const { data: profile } = await supabase
            .from("profiles")
            .select("email, stripe_customer_id, onboarding_status, subscription_status, plan_name")
            .eq("id", userId)
            .single();
        // Prevent double payment if already active
        const onboardingStatus = profile?.onboarding_status;
        const legacySubscriptionStatus = profile?.subscription_status;
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
            success_url: `${frontendUrl}/post-checkout`,
            cancel_url: `${frontendUrl}/pricing`,
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
    }
    catch (error) {
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
router.post("/portal", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({
                error: "UNAUTHORIZED",
                message: "User must be authenticated",
            });
        }
        const frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
            console.error("[STRIPE/PORTAL] Missing FRONTEND_URL");
            return res.status(500).json({
                error: "MISSING_CONFIGURATION",
                message: "FRONTEND_URL environment variable is not set",
            });
        }
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            console.error("[STRIPE/PORTAL] Missing Supabase configuration");
            return res.status(500).json({
                error: "MISSING_CONFIGURATION",
                message: "Supabase configuration not set",
            });
        }
        const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
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
            return_url: `${frontendUrl}/billing`,
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
    }
    catch (error) {
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
async function extractPromotionCodeFromSession(stripe, session) {
    try {
        // Method 1: Check session.total_details.breakdown.discounts (if available)
        const totalDetails = session.total_details;
        if (totalDetails?.breakdown?.discounts?.length > 0) {
            const discount = totalDetails.breakdown.discounts[0];
            if (discount.discount?.promotion_code) {
                return discount.discount.promotion_code;
            }
        }
        // Method 2: Retrieve the subscription and check its discount
        const subscriptionId = session.subscription;
        if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['discount.promotion_code'],
            });
            if (subscription.discount?.promotion_code) {
                const promoCode = subscription.discount.promotion_code;
                // Can be string ID or expanded object
                if (typeof promoCode === 'string') {
                    return promoCode;
                }
                else {
                    return promoCode.id;
                }
            }
        }
        return null;
    }
    catch (error) {
        console.error('[STRIPE/WEBHOOK] Error extracting promotion code:', error);
        return null;
    }
}
/**
 * Record an affiliate conversion (idempotent - uses session ID as unique key)
 * Non-blocking: errors are logged but do not fail the webhook
 */
async function recordAffiliateConversion(supabase, stripe, session, promotionCodeId, userId) {
    try {
        // 1. Look up affiliate by stripe_promotion_code_id
        const { data: affiliateData, error: affiliateError } = await supabase
            .from('affiliates')
            .select('id, name, commission_percent')
            .eq('stripe_promotion_code_id', promotionCodeId)
            .eq('is_active', true)
            .single();
        // Cast to typed interface (Supabase returns unknown without generated types)
        const affiliate = affiliateData;
        if (affiliateError || !affiliate) {
            // No affiliate found - might be a non-affiliate coupon, which is fine
            console.log(`[STRIPE/WEBHOOK] No affiliate found for promo code ${promotionCodeId} - skipping attribution`);
            return;
        }
        // 2. Calculate amounts
        const amountTotal = session.amount_total || 0; // Amount paid in cents (after discount)
        const amountSubtotal = session.amount_subtotal || 0; // Original amount before discount
        const discountAmount = Math.max(0, amountSubtotal - amountTotal);
        const commissionCents = Math.round(amountTotal * (affiliate.commission_percent / 100));
        // 3. Insert conversion (idempotent via UNIQUE constraint on stripe_checkout_session_id)
        const conversionData = {
            affiliate_id: affiliate.id,
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_subscription_id: session.subscription,
            amount_paid_cents: amountTotal,
            discount_cents: discountAmount,
            commission_percent: affiliate.commission_percent,
            commission_cents: commissionCents,
        };
        const { error: insertError } = await supabase
            .from('affiliate_conversions')
            .upsert(conversionData, {
            onConflict: 'stripe_checkout_session_id',
            ignoreDuplicates: true, // Don't error on duplicate, just skip
        });
        if (insertError) {
            console.error('[STRIPE/WEBHOOK] Error inserting affiliate conversion:', insertError);
            return;
        }
        console.log(`[STRIPE/WEBHOOK] ✅ Affiliate conversion recorded: affiliate=${affiliate.name}, user=${userId}, amount=${amountTotal / 100}€, commission=${commissionCents / 100}€`);
    }
    catch (error) {
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
async function handleStripeWebhook(req, res) {
    try {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error("[STRIPE/WEBHOOK] Missing STRIPE_WEBHOOK_SECRET");
            return res.status(500).send("Missing webhook configuration");
        }
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
        const session = event.data.object;
        const supabaseUserId = session.metadata?.supabase_user_id ||
            session.subscription?.metadata?.supabase_user_id;
        const planName = session.metadata?.plan_name;
        if (!supabaseUserId) {
            console.error("[STRIPE/WEBHOOK] Missing supabase_user_id in metadata");
            return res.status(400).send("Missing supabase_user_id");
        }
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            console.error("[STRIPE/WEBHOOK] Missing Supabase configuration");
            return res.status(500).send("Missing Supabase configuration");
        }
        const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
        // Get user email from Supabase auth for profile creation
        const { data: authUser } = await supabase.auth.admin.getUserById(supabaseUserId);
        const userEmail = authUser?.user?.email || session.customer_details?.email || "";
        // CRITICAL: Validate planName - must be starter or pro for paid checkout
        let finalPlan = "starter"; // Default fallback
        if (planName === "starter" || planName === "pro") {
            finalPlan = planName;
        }
        else {
            console.warn(`[STRIPE/WEBHOOK] Invalid or missing plan_name in session metadata: ${planName}`);
            // Try to get plan from subscription metadata as fallback
            const subscriptionId = session.subscription;
            if (subscriptionId) {
                try {
                    const stripe = getStripe();
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    const subPlan = subscription.metadata?.plan_name;
                    if (subPlan === "starter" || subPlan === "pro") {
                        finalPlan = subPlan;
                        console.log(`[STRIPE/WEBHOOK] Found plan in subscription metadata: ${subPlan}`);
                    }
                }
                catch (err) {
                    console.error("[STRIPE/WEBHOOK] Failed to retrieve subscription:", err);
                }
            }
        }
        console.log(`[STRIPE/WEBHOOK] Activating user ${supabaseUserId} with plan: ${finalPlan}`);
        // Get existing profile to preserve important fields (stripe_customer_id, role)
        const { data: existingProfileData } = await supabase
            .from("profiles")
            .select("stripe_customer_id, role, ai_cards_monthly_limit, ai_cards_used_current_month, ai_quota_reset_at")
            .eq("id", supabaseUserId)
            .single();
        // Cast to typed interface (Supabase returns unknown without generated types)
        const existingProfile = existingProfileData;
        // Preserve privileged roles (founder/admin) - never overwrite them
        const privilegedRoles = ["founder", "admin"];
        const existingRole = existingProfile?.role;
        const preserveRole = existingRole && privilegedRoles.includes(existingRole);
        const quotaLimitByPlan = {
            starter: 300,
            pro: 1000,
        };
        const targetMonthlyLimit = quotaLimitByPlan[finalPlan];
        const existingLimit = existingProfile?.ai_cards_monthly_limit ?? 0;
        const nextMonthReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
        const shouldSetQuotaLimit = existingLimit < targetMonthlyLimit;
        // CRITICAL: Use UPSERT to create/update profile.
        // This ensures paid users always get the correct plan set.
        // The webhook is the SINGLE SOURCE OF TRUTH for paid plan activation.
        const profileData = {
            id: supabaseUserId,
            email: userEmail,
            role: preserveRole ? existingRole : "user",
            plan: finalPlan,
            plan_name: finalPlan,
            onboarding_status: "active",
            subscription_status: "active",
        };
        if (shouldSetQuotaLimit) {
            profileData.ai_cards_monthly_limit = targetMonthlyLimit;
        }
        if (existingProfile?.ai_cards_used_current_month !== null && existingProfile?.ai_cards_used_current_month !== undefined) {
            profileData.ai_cards_used_current_month = existingProfile.ai_cards_used_current_month;
        }
        if (!existingProfile?.ai_quota_reset_at) {
            profileData.ai_quota_reset_at = nextMonthReset.toISOString();
        }
        if (existingProfile?.stripe_customer_id) {
            profileData.stripe_customer_id = existingProfile.stripe_customer_id;
        }
        const { error: upsertError } = await supabase
            .from("profiles")
            .upsert(profileData, {
            onConflict: "id",
            ignoreDuplicates: false // Force update even if exists
        });
        if (upsertError) {
            console.error("[STRIPE/WEBHOOK] Failed to upsert profile:", upsertError);
            return res.status(500).send("Failed to upsert profile");
        }
        console.log(`[STRIPE/WEBHOOK] Successfully activated user ${supabaseUserId} with plan ${finalPlan}`);
        // --- AFFILIATE TRACKING (non-blocking) ---
        try {
            const promotionCodeId = await extractPromotionCodeFromSession(stripe, session);
            if (promotionCodeId) {
                console.log(`[STRIPE/WEBHOOK] Promotion code detected: ${promotionCodeId}`);
                await recordAffiliateConversion(supabase, stripe, session, promotionCodeId, supabaseUserId);
            }
            else {
                console.log(`[STRIPE/WEBHOOK] No promotion code used for this checkout`);
            }
        }
        catch (affiliateError) {
            // Log but don't fail the webhook - affiliate tracking is not critical
            console.error('[STRIPE/WEBHOOK] Affiliate tracking error (non-fatal):', affiliateError);
        }
        // --- END AFFILIATE TRACKING ---
        return res.json({ received: true });
    }
    catch (error) {
        console.error("[STRIPE/WEBHOOK] Error:", error);
        return res.status(400).send("Webhook Error");
    }
}
exports.default = router;
//# sourceMappingURL=stripe.js.map