// CRITICAL: Load dotenv FIRST before any code that reads process.env
import dotenv from "dotenv";
dotenv.config();

// Validate required environment variables IMMEDIATELY at startup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("[BACKEND] ❌ FATAL: Missing required Supabase environment variables");
  console.error("[BACKEND] Required variables:");
  console.error("[BACKEND]   - SUPABASE_URL:", supabaseUrl ? "SET" : "NOT SET");
  console.error("[BACKEND]   - SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "SET" : "NOT SET");
  console.error("[BACKEND] Server will not start. Please configure these variables in Railway.");
  process.exit(1);
}

// Safe log: boolean only, NEVER log the actual key
console.log("[BACKEND] ✅ Supabase configuration validated");
console.log("[BACKEND]   - SUPABASE_URL: SET");
console.log("[BACKEND]   - SUPABASE_SERVICE_ROLE_KEY: SET");

import express from "express";
import cors from "cors";
import { requireBackendKey } from "./middleware/auth";
import ankiRouter from "./routes/anki";
import pdfRouter from "./routes/pdf";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "soma-backend" });
});

// Protected routes - require backend API key
app.use("/anki", requireBackendKey, ankiRouter);
app.use("/pdf", requireBackendKey, pdfRouter);

// Start server
app.listen(PORT, () => {
  console.log(`[BACKEND] Server running on port ${PORT}`);
  console.log(`[BACKEND] Environment: ${process.env.NODE_ENV || "development"}`);
  if (!process.env.BACKEND_API_KEY) {
    console.warn("[BACKEND] ⚠️  BACKEND_API_KEY not set - allowing all requests in dev mode");
  }
});
