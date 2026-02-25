import "dotenv/config";

import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/auth";
import ankiRouter from "./routes/anki";
import pdfRouter from "./routes/pdf";
import generateRouter from "./routes/generate";
import languagesRouter from "./routes/languages";
import stripeRouter, { handleStripeWebhook } from "./routes/stripe";
import { getEnv, type BackendEnv } from "./env";

let env: BackendEnv;
try {
  env = getEnv();
} catch (error) {
  console.error("[BACKEND] ❌ FATAL: Invalid environment configuration");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log("[BACKEND] ✅ Configuration validated");
console.log("[BACKEND]   - SUPABASE_URL: SET");
console.log("[BACKEND]   - SUPABASE_SERVICE_ROLE_KEY: SET");
console.log("[BACKEND]   - SUPABASE_ANON_KEY: SET");
console.log("[BACKEND]   - OPENAI_API_KEY: SET");
console.log("[BACKEND]   - STRIPE_SECRET_KEY: SET");
console.log("[BACKEND]   - STRIPE_WEBHOOK_SECRET: SET");
console.log("[BACKEND]   - FRONTEND_URL: SET");
console.log("[BACKEND]   - STRIPE_STARTER_PRICE_ID: SET");
console.log("[BACKEND]   - STRIPE_PRO_PRICE_ID: SET");

const app = express();

console.log("[CORS] Allowed origin:", env.CORS_ORIGIN);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.options(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Explicitly short-circuit PDF preflight before auth and routers
app.options("/pdf/*", (_req, res) => {
  res.sendStatus(204);
});

// Stripe webhook MUST receive raw body for signature verification (no auth)
// IMPORTANT: this must be registered BEFORE express.json()
app.post("/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

// Body parser for JSON (but NOT for multipart/form-data - multer handles that)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "soma-backend" });
});

// Stripe checkout and portal are authenticated inside the router.
app.use("/stripe", stripeRouter);

app.use("/anki", requireAuth, ankiRouter);
app.use("/pdf", requireAuth, pdfRouter);
app.use("/generate", requireAuth, generateRouter);
app.use("/languages", requireAuth, languagesRouter);

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`[BACKEND] Server running on port ${PORT}`);
  console.log(`[BACKEND] Environment: ${env.NODE_ENV || "development"}`);
});
