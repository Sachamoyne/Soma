// CRITICAL: Load dotenv FIRST before any code that reads process.env
import dotenv from "dotenv";
dotenv.config();

// Validate required environment variables IMMEDIATELY at startup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const frontendUrl = process.env.FRONTEND_URL;
const somaStarterPriceId = process.env.SOMA_STARTER_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID;
const somaProPriceId = process.env.SOMA_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error("[BACKEND] ❌ FATAL: Missing required Supabase environment variables");
  console.error("[BACKEND] Required variables:");
  console.error("[BACKEND]   - SUPABASE_URL:", supabaseUrl ? "SET" : "NOT SET");
  console.error("[BACKEND]   - SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "SET" : "NOT SET");
  console.error("[BACKEND]   - SUPABASE_ANON_KEY:", supabaseAnonKey ? "SET" : "NOT SET");
  console.error("[BACKEND] Server will not start. Please configure these variables in Railway.");
  process.exit(1);
}

if (!openaiApiKey) {
  console.error("[BACKEND] ❌ FATAL: Missing OPENAI_API_KEY");
  console.error("[BACKEND] Server will not start. Please configure OPENAI_API_KEY in Railway.");
  process.exit(1);
}

// Validate Stripe configuration (required for checkout)
if (!stripeSecretKey) {
  console.error("[BACKEND] ❌ FATAL: Missing STRIPE_SECRET_KEY");
  console.error("[BACKEND] Server will not start. Please configure STRIPE_SECRET_KEY in Railway.");
  process.exit(1);
}

if (!frontendUrl) {
  console.error("[BACKEND] ❌ FATAL: Missing FRONTEND_URL");
  console.error("[BACKEND] Server will not start. Please configure FRONTEND_URL in Railway.");
  process.exit(1);
}

if (!somaStarterPriceId || !somaProPriceId) {
  console.error("[BACKEND] ❌ FATAL: Missing Stripe Price IDs");
  console.error("[BACKEND] Required variables:");
  console.error("[BACKEND]   - SOMA_STARTER_PRICE_ID or STRIPE_STARTER_PRICE_ID:", somaStarterPriceId ? "SET" : "NOT SET");
  console.error("[BACKEND]   - SOMA_PRO_PRICE_ID or STRIPE_PRO_PRICE_ID:", somaProPriceId ? "SET" : "NOT SET");
  console.error("[BACKEND] Server will not start. Please configure these variables in Railway.");
  process.exit(1);
}

// Safe log: boolean only, NEVER log the actual key
console.log("[BACKEND] ✅ Configuration validated");
console.log("[BACKEND]   - SUPABASE_URL: SET");
console.log("[BACKEND]   - SUPABASE_SERVICE_ROLE_KEY: SET");
console.log("[BACKEND]   - SUPABASE_ANON_KEY: SET");
console.log("[BACKEND]   - OPENAI_API_KEY: SET");
console.log("[BACKEND]   - STRIPE_SECRET_KEY: SET");
console.log("[BACKEND]   - FRONTEND_URL: SET");
console.log("[BACKEND]   - SOMA_STARTER_PRICE_ID: SET");
console.log("[BACKEND]   - SOMA_PRO_PRICE_ID: SET");

import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/auth";
import ankiRouter from "./routes/anki";
import pdfRouter from "./routes/pdf";
import generateRouter from "./routes/generate";
import stripeRouter from "./routes/stripe";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - MUST be before any auth middleware or routes
const corsOrigin = process.env.CORS_ORIGIN;

if (!corsOrigin) {
  console.warn("[CORS] CORS_ORIGIN is not defined");
}

console.log("[CORS] Allowed origin:", corsOrigin);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Handle preflight requests explicitly
app.options(
  "*",
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Explicitly short-circuit PDF preflight before auth and routers
app.options("/pdf/*", (req, res) => {
  res.sendStatus(204);
});

// Body parser for JSON (but NOT for multipart/form-data - multer handles that)
app.use(express.json({ limit: "50mb" })); // Support large file uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" })); // Support form data

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "soma-backend" });
});

// Protected routes - authentication via Supabase JWT in Authorization header
app.use("/stripe", requireAuth, stripeRouter); // Checkout now requires auth (account before payment)
app.use("/anki", requireAuth, ankiRouter);
app.use("/pdf", requireAuth, pdfRouter);
app.use("/generate", requireAuth, generateRouter);

// Start server
app.listen(PORT, () => {
  console.log(`[BACKEND] Server running on port ${PORT}`);
  console.log(`[BACKEND] Environment: ${process.env.NODE_ENV || "development"}`);
});
