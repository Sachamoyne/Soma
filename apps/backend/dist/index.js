"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// CRITICAL: Load dotenv FIRST before any code that reads process.env
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("./middleware/auth");
const anki_1 = __importDefault(require("./routes/anki"));
const pdf_1 = __importDefault(require("./routes/pdf"));
const generate_1 = __importDefault(require("./routes/generate"));
const languages_1 = __importDefault(require("./routes/languages"));
const stripe_1 = __importStar(require("./routes/stripe"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// CORS configuration - MUST be before any auth middleware or routes
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
    console.warn("[CORS] CORS_ORIGIN is not defined");
}
console.log("[CORS] Allowed origin:", corsOrigin);
app.use((0, cors_1.default)({
    origin: corsOrigin,
    credentials: true,
}));
// Handle preflight requests explicitly
app.options("*", (0, cors_1.default)({
    origin: corsOrigin,
    credentials: true,
}));
// Explicitly short-circuit PDF preflight before auth and routers
app.options("/pdf/*", (req, res) => {
    res.sendStatus(204);
});
// Stripe webhook MUST receive raw body for signature verification (no auth)
// IMPORTANT: this must be registered BEFORE express.json()
app.post("/stripe/webhook", express_1.default.raw({ type: "application/json" }), stripe_1.handleStripeWebhook);
// Body parser for JSON (but NOT for multipart/form-data - multer handles that)
app.use(express_1.default.json({ limit: "50mb" })); // Support large file uploads
app.use(express_1.default.urlencoded({ extended: true, limit: "50mb" })); // Support form data
// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "soma-backend" });
});
// Stripe checkout is public OR authenticated (route handles userId/auth internally)
app.use("/stripe", stripe_1.default);
// Protected routes - authentication via Supabase JWT in Authorization header
app.use("/anki", auth_1.requireAuth, anki_1.default);
app.use("/pdf", auth_1.requireAuth, pdf_1.default);
app.use("/generate", auth_1.requireAuth, generate_1.default);
app.use("/languages", auth_1.requireAuth, languages_1.default);
// Start server
app.listen(PORT, () => {
    console.log(`[BACKEND] Server running on port ${PORT}`);
    console.log(`[BACKEND] Environment: ${process.env.NODE_ENV || "development"}`);
});
//# sourceMappingURL=index.js.map