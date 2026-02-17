import { z } from "zod";

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_ANON_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    FRONTEND_URL: z.string().url(),
    CORS_ORIGIN: z.string().min(1),
    SOMA_STARTER_PRICE_ID: z.string().min(1).optional(),
    SOMA_PRO_PRICE_ID: z.string().min(1).optional(),
    STRIPE_STARTER_PRICE_ID: z.string().min(1).optional(),
    STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
    LLM_MODEL: z.string().min(1).optional(),
    LLM_BASE_URL: z.string().url().optional(),
    NODE_ENV: z.string().optional(),
    PORT: z.string().optional(),
  })
  .transform((raw) => {
    const starterPriceId = raw.SOMA_STARTER_PRICE_ID ?? raw.STRIPE_STARTER_PRICE_ID;
    const proPriceId = raw.SOMA_PRO_PRICE_ID ?? raw.STRIPE_PRO_PRICE_ID;

    if (!starterPriceId || !proPriceId) {
      throw new Error(
        "Missing Stripe price IDs. Set SOMA_STARTER_PRICE_ID/SOMA_PRO_PRICE_ID (or STRIPE_* equivalents)."
      );
    }

    return {
      ...raw,
      STRIPE_STARTER_PRICE_ID: starterPriceId,
      STRIPE_PRO_PRICE_ID: proPriceId,
      PORT: Number(raw.PORT ?? "3000"),
    };
  });

export type BackendEnv = ReturnType<typeof getEnv>;

let cachedEnv: z.output<typeof envSchema> | null = null;

/**
 * Parse and validate backend environment once.
 * Called at startup and reused by routes/middleware.
 */
export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid backend environment: ${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

