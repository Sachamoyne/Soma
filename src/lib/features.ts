/**
 * Feature flags for controlling application behavior.
 * Set WAITLIST_ONLY to true to enable waitlist mode:
 * - Hides Login and Pricing links from navbar
 * - Hides Login CTA button on landing page
 * - Redirects /login and /pricing routes to /
 */
export const WAITLIST_ONLY =
  process.env.NEXT_PUBLIC_WAITLIST_ONLY === "true";

