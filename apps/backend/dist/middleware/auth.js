"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabase_js_1 = require("@supabase/supabase-js");
/**
 * Middleware to authenticate requests using Supabase JWT token.
 * Validates the token via Supabase API and attaches user to req.user.
 */
async function requireAuth(req, res, next) {
    try {
        // CORS preflight requests never include Authorization headers.
        // Always allow OPTIONS to succeed without authentication.
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.warn("[AUTH] Missing or invalid Authorization header");
            res.status(401).json({
                error: "Unauthorized",
                message: "Missing or invalid Authorization header",
            });
            return;
        }
        const token = authHeader.substring(7);
        if (!token) {
            console.warn("[AUTH] Empty token");
            res.status(401).json({
                error: "Unauthorized",
                message: "Empty token",
            });
            return;
        }
        // Verify Supabase configuration
        const supabaseUrl = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) {
            console.error("[AUTH] Missing Supabase configuration");
            res.status(500).json({
                error: "Internal Server Error",
                message: "Server configuration error",
            });
            return;
        }
        // Create Supabase client with ANON_KEY for JWT verification (ES256)
        // Service Role Key cannot properly verify ES256-signed JWTs
        const supabaseAuth = (0, supabase_js_1.createClient)(supabaseUrl, anonKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        // Verify token via Supabase API using ANON_KEY client
        let data, error;
        try {
            const result = await supabaseAuth.auth.getUser(token);
            data = result.data;
            error = result.error;
        }
        catch (err) {
            console.error("[AUTH] Exception during getUser():", err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Authentication service error",
            });
            return;
        }
        // Refuse if error is non-null or data.user is null
        if (error || !data?.user) {
            console.warn("[AUTH] Token validation failed:", error?.message || "User is null");
            res.status(401).json({
                error: "Unauthorized",
                message: error?.message || "Invalid or expired token",
            });
            return;
        }
        // Attach user to request
        req.user = data.user;
        req.userId = data.user.id;
        // Continue to next middleware/route handler
        next();
    }
    catch (error) {
        console.error("[AUTH] Unexpected error during authentication:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Authentication failed",
        });
    }
}
//# sourceMappingURL=auth.js.map