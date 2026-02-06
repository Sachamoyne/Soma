"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_js_1 = require("@supabase/supabase-js");
const ai_cards_1 = require("../lib/ai-cards");
const router = express_1.default.Router();
// POST /generate/cards - Generate card preview (no insertion)
router.post("/cards", async (req, res) => {
    try {
        console.log("[GENERATE/CARDS] Request received");
        // User is already authenticated by requireAuth middleware
        const userId = req.userId;
        if (!userId) {
            console.error("[GENERATE/CARDS] No valid user token");
            return res.status(401).json({
                error: "Unauthorized",
                message: "Invalid or missing authentication token",
            });
        }
        // Validate request body
        const { text, deck_id, language, cardsCount, detailLevel } = req.body;
        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Text is required and must be a non-empty string",
            });
        }
        if (!deck_id || typeof deck_id !== "string") {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "deck_id is required and must be a UUID string",
            });
        }
        // Validate optional cardsCount (3-50)
        let validatedCardsCount;
        if (cardsCount !== undefined) {
            const parsedCount = Number(cardsCount);
            if (!Number.isInteger(parsedCount) || parsedCount < 3 || parsedCount > 50) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "cardsCount must be an integer between 3 and 50",
                });
            }
            validatedCardsCount = parsedCount;
        }
        // Validate optional detailLevel (enum: "summary" | "standard" | "detailed")
        let validatedDetailLevel = "standard";
        if (detailLevel !== undefined) {
            if (!["summary", "standard", "detailed"].includes(detailLevel)) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "detailLevel must be 'summary', 'standard', or 'detailed'",
                });
            }
            validatedDetailLevel = detailLevel;
        }
        // Verify Supabase configuration
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            console.error("[GENERATE/CARDS] Missing Supabase configuration");
            return res.status(500).json({
                error: "INTERNAL_ERROR",
                message: "Server configuration error",
            });
        }
        const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        // Verify deck exists and belongs to user
        const { data: deck, error: deckError } = await supabase
            .from("decks")
            .select("id, user_id")
            .eq("id", deck_id)
            .single();
        if (deckError || !deck) {
            console.log("[GENERATE/CARDS] Deck not found:", deckError);
            return res.status(404).json({
                error: "DECK_NOT_FOUND",
                message: "Deck not found",
            });
        }
        if (deck.user_id !== userId) {
            console.log("[GENERATE/CARDS] Deck ownership mismatch");
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Deck does not belong to user",
            });
        }
        // Build generation options
        const generationOptions = {};
        if (validatedCardsCount !== undefined) {
            generationOptions.cardsCount = validatedCardsCount;
        }
        if (validatedDetailLevel !== "standard") {
            generationOptions.detailLevel = validatedDetailLevel;
        }
        // Generate cards preview
        const result = await (0, ai_cards_1.generateCardsPreview)(text.trim(), deck_id, userId, Object.keys(generationOptions).length > 0 ? generationOptions : undefined);
        // Handle error responses
        if (!result.success) {
            console.log("[GENERATE/CARDS] Generation failed:", result.error);
            return res.status(result.status || 500).json({
                error: result.error,
                code: result.code,
                message: result.message,
                plan: result.plan,
                used: result.used,
                limit: result.limit,
                remaining: result.remaining,
                reset_at: result.reset_at,
            });
        }
        // Success - return preview
        console.log("[GENERATE/CARDS] Success:", result.cards.length, "cards generated");
        return res.json({
            deck_id: result.deckId,
            cards: result.cards,
        });
    }
    catch (error) {
        console.error("[GENERATE/CARDS] Unexpected error:", error);
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to generate cards",
        });
    }
});
// POST /generate/confirm - Confirm and insert selected cards
router.post("/confirm", async (req, res) => {
    try {
        console.log("[GENERATE/CONFIRM] Request received");
        // User is already authenticated by requireAuth middleware
        const userId = req.userId;
        if (!userId) {
            console.error("[GENERATE/CONFIRM] No valid user token");
            return res.status(401).json({
                error: "Unauthorized",
                message: "Invalid or missing authentication token",
            });
        }
        // Validate request body
        const { deck_id, cards } = req.body;
        if (!deck_id || typeof deck_id !== "string") {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "deck_id is required and must be a UUID string",
            });
        }
        if (!Array.isArray(cards) || cards.length === 0 || cards.length > 20) {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "cards must be a non-empty array (max 20 items)",
            });
        }
        // Validate each card
        for (const card of cards) {
            if (!card.front || typeof card.front !== "string" || card.front.trim().length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Each card must have a non-empty 'front' field",
                });
            }
            if (!card.back || typeof card.back !== "string" || card.back.trim().length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Each card must have a non-empty 'back' field",
                });
            }
        }
        // Verify Supabase configuration
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            console.error("[GENERATE/CONFIRM] Missing Supabase configuration");
            return res.status(500).json({
                error: "INTERNAL_ERROR",
                message: "Server configuration error",
            });
        }
        // Confirm and insert cards
        const result = await (0, ai_cards_1.confirmAndInsertCards)({
            deckId: deck_id,
            userId,
            cards: cards,
        });
        // Handle error responses
        if (!result.success) {
            console.log("[GENERATE/CONFIRM] Insertion failed:", result.error);
            return res.status(result.status || 500).json({
                error: result.error,
                code: result.code,
                message: result.message,
                plan: result.plan,
                used: result.used,
                limit: result.limit,
                remaining: result.remaining,
                reset_at: result.reset_at,
            });
        }
        // Success
        console.log("[GENERATE/CONFIRM] Success:", result.imported, "cards inserted");
        return res.json({
            deck_id: result.deckId,
            imported: result.imported,
            cards: result.cards,
        });
    }
    catch (error) {
        console.error("[GENERATE/CONFIRM] Unexpected error:", error);
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to confirm cards",
        });
    }
});
exports.default = router;
//# sourceMappingURL=generate.js.map