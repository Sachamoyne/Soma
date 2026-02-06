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
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const supabase_js_1 = require("@supabase/supabase-js");
const ai_cards_1 = require("../lib/ai-cards");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIN_TEXT_LENGTH = 50; // Minimum chars to consider PDF has text layer
/**
 * Extract text from a PDF buffer using pdf-parse v2
 */
async function extractTextFromPdf(buffer) {
    const start = Date.now();
    console.log("[extractTextFromPdf] START - buffer info:", {
        bufferLength: buffer.length,
        isBuffer: Buffer.isBuffer(buffer),
        header: buffer.slice(0, 20).toString("utf8"),
    });
    // Validate PDF header
    const header = buffer.slice(0, 8).toString("utf8");
    if (!header.startsWith("%PDF")) {
        console.error("[extractTextFromPdf] Invalid PDF header:", header);
        return {
            success: false,
            code: "PDF_INVALID",
            message: "Le fichier n'est pas un PDF valide.",
            details: `Invalid header: ${header.substring(0, 20)}`,
        };
    }
    let parser = null;
    try {
        console.log("[extractTextFromPdf] Loading pdf-parse module (dynamic import)...");
        let pdfParseModule;
        try {
            pdfParseModule = await Promise.resolve().then(() => __importStar(require("pdf-parse")));
        }
        catch (importError) {
            console.log("[extractTextFromPdf] ESM import failed, trying require...", importError);
            pdfParseModule = require("pdf-parse");
        }
        console.log("[extractTextFromPdf] Module loaded, keys:", Object.keys(pdfParseModule));
        const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse || pdfParseModule.default;
        console.log("[extractTextFromPdf] PDFParse type:", typeof PDFParse);
        if (!PDFParse) {
            console.error("[extractTextFromPdf] PDFParse not found in module");
            console.error("[extractTextFromPdf] Available exports:", Object.keys(pdfParseModule));
            throw new Error("PDFParse class not found in pdf-parse module");
        }
        console.log("[extractTextFromPdf] Creating parser instance...");
        const bufferInstance = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        parser = new PDFParse({ data: bufferInstance });
        console.log("[extractTextFromPdf] Parser created, type:", typeof parser);
        console.log("[extractTextFromPdf] Calling getText()...");
        const result = await parser.getText();
        console.log("[extractTextFromPdf] getText() returned");
        const pages = result?.total || 0;
        const rawText = result?.text || "";
        console.log("[extractTextFromPdf] Extraction complete:", {
            pages,
            rawTextLength: rawText.length,
        });
        // Check if PDF has meaningful text (lowered threshold to 50)
        if (rawText.length < 50) {
            return {
                success: false,
                code: "PDF_NO_TEXT",
                message: "Ce PDF ne contient pas de texte sélectionnable. Il s'agit probablement d'un PDF scanné (image). Veuillez utiliser un PDF avec du texte.",
                details: `Extracted only ${rawText.length} characters from ${pages} pages`,
            };
        }
        return {
            success: true,
            text: rawText,
            pages,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[extractTextFromPdf] CATCH ERROR:", {
            name: error instanceof Error ? error.name : "Unknown",
            message: errorMessage,
            stack: error instanceof Error ? error.stack : "",
            bufferLength: buffer?.length,
        });
        // Detect encrypted PDFs
        if (errorMessage.includes("password") ||
            errorMessage.includes("encrypted") ||
            errorMessage.includes("PasswordException")) {
            return {
                success: false,
                code: "PDF_ENCRYPTED",
                message: "Ce PDF est protégé par un mot de passe. Veuillez le déverrouiller avant de l'importer.",
                details: errorMessage,
            };
        }
        // Detect invalid PDF structure
        if (errorMessage.includes("Invalid PDF") ||
            errorMessage.includes("invalid") ||
            errorMessage.includes("InvalidPDFException")) {
            return {
                success: false,
                code: "PDF_INVALID",
                message: "Ce fichier PDF semble corrompu ou mal formé. Veuillez essayer un autre fichier.",
                details: errorMessage,
            };
        }
        // Generic parse error
        return {
            success: false,
            code: "PDF_PARSE_ERROR",
            message: "Impossible d'extraire le texte de ce PDF. Veuillez essayer un autre fichier.",
            details: errorMessage,
        };
    }
    finally {
        if (parser) {
            try {
                await parser.destroy();
            }
            catch {
                // Ignore cleanup errors
            }
        }
        console.log("[extractTextFromPdf] END in ms:", Date.now() - start);
    }
}
/**
 * Normalize extracted text from PDF
 * Removes extra line breaks, headers, footers when possible
 */
function normalizeText(text) {
    // Remove excessive line breaks (more than 2 consecutive)
    let normalized = text.replace(/\n{3,}/g, "\n\n");
    // Remove common header/footer patterns (page numbers, dates, etc.)
    normalized = normalized.replace(/^\d+\s*$/gm, ""); // Standalone page numbers
    normalized = normalized.replace(/Page \d+ of \d+/gi, ""); // Page X of Y
    normalized = normalized.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ""); // Dates
    // Remove excessive whitespace
    normalized = normalized.replace(/[ \t]+/g, " ");
    // Trim each line
    normalized = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");
    return normalized.trim();
}
// Helper: Parse cookies from Express request
function parseCookies(cookieHeader) {
    const cookies = new Map();
    if (!cookieHeader)
        return cookies;
    cookieHeader.split(";").forEach((cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        if (name && valueParts.length > 0) {
            cookies.set(name, decodeURIComponent(valueParts.join("=")));
        }
    });
    return cookies;
}
// POST /pdf/import - Extract text from PDF (no AI generation)
router.post("/import", upload.single("file"), async (req, res) => {
    try {
        console.log("[pdf/import] Request received");
        // User is already authenticated by requireAuth middleware
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "UNAUTHORIZED",
                message: "Authentication required",
            });
        }
        // Get file from multer
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                code: "NO_FILE",
                message: "No file provided",
            });
        }
        // Validate file type
        if (file.mimetype !== "application/pdf" &&
            !file.originalname.toLowerCase().endsWith(".pdf")) {
            return res.status(415).json({
                success: false,
                code: "INVALID_FILE_TYPE",
                message: "Invalid file type. Only PDF files are supported.",
            });
        }
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return res.status(413).json({
                success: false,
                code: "PDF_TOO_LARGE",
                message: `PDF is too large. Maximum size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`,
            });
        }
        // Extract text from PDF
        const extractionResult = await extractTextFromPdf(file.buffer);
        if (!extractionResult.success) {
            const statusMap = {
                PDF_NO_TEXT: 422,
                PDF_ENCRYPTED: 422,
                PDF_INVALID: 400,
                PDF_PARSE_ERROR: 422,
                PDF_TOO_LARGE: 413,
            };
            return res.status(statusMap[extractionResult.code] || 422).json({
                success: false,
                code: extractionResult.code,
                message: extractionResult.message,
            });
        }
        // Normalize extracted text
        const normalizedText = normalizeText(extractionResult.text);
        // Check if normalized text is sufficient
        if (normalizedText.length < MIN_TEXT_LENGTH) {
            return res.status(422).json({
                success: false,
                code: "PDF_NO_TEXT",
                message: "Extracted text is too short. The PDF may not contain selectable text.",
            });
        }
        // Success - return extracted text
        console.log("[pdf/import] Success:", {
            pages: extractionResult.pages,
            textLength: normalizedText.length,
        });
        return res.json({
            success: true,
            text: normalizedText,
            pages: extractionResult.pages,
        });
    }
    catch (error) {
        console.error("[pdf/import] Unexpected error:", error);
        return res.status(500).json({
            success: false,
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to extract text from PDF",
        });
    }
});
// POST /pdf/generate-cards - Extract text from PDF and generate AI cards
router.post("/generate-cards", upload.single("file"), async (req, res) => {
    try {
        console.log("[generate-cards-from-pdf] Request received");
        // User is already authenticated by requireAuth middleware
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "UNAUTHORIZED",
                message: "Non autorisé",
            });
        }
        // Get file from multer
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                code: "NO_FILE",
                message: "Aucun fichier fourni",
            });
        }
        // Get deck_id from form data
        const deckId = req.body.deck_id;
        if (!deckId) {
            return res.status(400).json({
                success: false,
                code: "NO_DECK_ID",
                message: "Deck ID requis",
            });
        }
        // Get optional generation parameters from form data
        const { cardsCount, detailLevel } = req.body;
        // Validate optional cardsCount (3-50)
        let validatedCardsCount;
        if (cardsCount !== undefined && cardsCount !== "") {
            const parsedCount = Number(cardsCount);
            if (!Number.isInteger(parsedCount) || parsedCount < 3 || parsedCount > 50) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: "cardsCount must be an integer between 3 and 50",
                });
            }
            validatedCardsCount = parsedCount;
        }
        // Validate optional detailLevel (enum: "summary" | "standard" | "detailed")
        let validatedDetailLevel = "standard";
        if (detailLevel !== undefined && detailLevel !== "") {
            if (!["summary", "standard", "detailed"].includes(detailLevel)) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: "detailLevel must be 'summary', 'standard', or 'detailed'",
                });
            }
            validatedDetailLevel = detailLevel;
        }
        // Validate file type
        if (file.mimetype !== "application/pdf" &&
            !file.originalname.toLowerCase().endsWith(".pdf")) {
            return res.status(415).json({
                success: false,
                code: "INVALID_FILE_TYPE",
                message: "Type de fichier invalide. Seuls les PDF sont supportés.",
            });
        }
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return res.status(413).json({
                success: false,
                code: "PDF_TOO_LARGE",
                message: "Le PDF est trop volumineux. Taille maximale : 15 MB.",
            });
        }
        console.log("[generate-cards-from-pdf] File info:", {
            name: file.originalname,
            size: file.size,
            sizeMB: (file.size / 1024 / 1024).toFixed(2),
            type: file.mimetype,
        });
        // Create Supabase client for deck verification
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({
                success: false,
                code: "INTERNAL_ERROR",
                message: "Supabase configuration missing",
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
            .eq("id", deckId)
            .single();
        if (deckError || !deck) {
            return res.status(404).json({
                success: false,
                code: "DECK_NOT_FOUND",
                message: "Deck non trouvé",
            });
        }
        if (deck.user_id !== userId) {
            return res.status(403).json({
                success: false,
                code: "FORBIDDEN",
                message: "Ce deck ne vous appartient pas",
            });
        }
        // Convert file buffer (multer already provides Buffer)
        const pdfBuffer = file.buffer;
        console.log("[generate-cards-from-pdf] Buffer created:", {
            bufferLength: pdfBuffer.length,
            header: pdfBuffer.slice(0, 8).toString("utf8"),
        });
        // Extract text from PDF
        console.log("[generate-cards-from-pdf] Extracting text...");
        const extractionResult = await extractTextFromPdf(pdfBuffer);
        if (!extractionResult.success) {
            console.log("[generate-cards-from-pdf] Extraction failed:", extractionResult);
            // Map error codes to HTTP status
            const statusMap = {
                PDF_NO_TEXT: 422,
                PDF_ENCRYPTED: 422,
                PDF_INVALID: 400,
                PDF_PARSE_ERROR: 422,
                PDF_TOO_LARGE: 413,
            };
            return res.status(statusMap[extractionResult.code] || 422).json({
                success: false,
                code: extractionResult.code,
                message: extractionResult.message,
                error: extractionResult.message, // For backward compatibility with front-end
            });
        }
        // Normalize the extracted text
        const extractedText = normalizeText(extractionResult.text);
        console.log("[generate-cards-from-pdf] Text extracted successfully:", {
            pages: extractionResult.pages,
            rawLength: extractionResult.text.length,
            normalizedLength: extractedText.length,
            preview: extractedText.substring(0, 100),
        });
        // Check if normalized text is sufficient
        if (extractedText.length < MIN_TEXT_LENGTH) {
            return res.status(422).json({
                success: false,
                code: "PDF_NO_TEXT",
                message: "Le texte extrait est trop court. Le PDF ne contient peut-être pas assez de texte sélectionnable.",
                error: "Le texte extrait est trop court. Le PDF ne contient peut-être pas assez de texte sélectionnable.",
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
        generationOptions.isPdf = true;
        // Generate cards preview (NO insertion yet)
        console.log("[generate-cards-from-pdf] Generating cards preview from extracted text...", {
            cardsCount: validatedCardsCount,
            detailLevel: validatedDetailLevel,
        });
        const result = await (0, ai_cards_1.generateCardsPreview)(extractedText, deckId, userId, Object.keys(generationOptions).length > 0 ? generationOptions : undefined);
        // Handle error responses
        if (!result.success) {
            console.log("[generate-cards-from-pdf] Card generation failed:", result.error);
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
        // Success - return preview (cards NOT inserted yet)
        console.log("[generate-cards-from-pdf] Successfully generated preview:", result.cards.length);
        return res.json({
            deck_id: result.deckId,
            cards: result.cards,
            // Note: 'imported' is not returned here because cards are not inserted yet
        });
    }
    catch (error) {
        console.error("[generate-cards-from-pdf] Unexpected error:", error);
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to process PDF",
        });
    }
});
exports.default = router;
//# sourceMappingURL=pdf.js.map