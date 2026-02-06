import express, { Request, Response } from "express";
declare const router: import("express-serve-static-core").Router;
/**
 * POST /stripe/webhook
 * Stripe sends checkout.session.completed here.
 * We verify the signature and then activate the user's onboarding status.
 *
 * IMPORTANT: this handler MUST be wired with express.raw({ type: "application/json" }) in index.ts.
 */
export declare function handleStripeWebhook(req: Request, res: Response): Promise<express.Response<any, Record<string, any>>>;
export default router;
//# sourceMappingURL=stripe.d.ts.map