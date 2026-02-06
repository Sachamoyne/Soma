"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
const os_1 = require("os");
const path_1 = require("path");
const fs_1 = require("fs");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// ============================================================================
// CRITICAL: Date Normalization Functions
// These functions prevent "Invalid time value" errors by validating all dates
// ============================================================================
/**
 * Validates and normalizes a timestamp value.
 * Returns null if the value is invalid, otherwise returns the normalized timestamp.
 */
function validateTimestamp(value, fieldName) {
    // Check for null/undefined
    if (value == null) {
        console.warn(`[ANKI IMPORT] ${fieldName} is null/undefined`);
        return null;
    }
    // Convert to number
    const num = Number(value);
    // Check for NaN
    if (isNaN(num)) {
        console.warn(`[ANKI IMPORT] ${fieldName} is NaN: ${value}`);
        return null;
    }
    // Check for negative (except for special cases where negative is valid)
    if (num < 0 && fieldName !== "ivl" && fieldName !== "due") {
        console.warn(`[ANKI IMPORT] ${fieldName} is negative: ${num}`);
        return null;
    }
    // Check for unreasonably large values (year 3000+)
    // Unix timestamp for year 3000 is ~32,503,680,000 seconds or 32,503,680,000,000 ms
    if (num > 32503680000) {
        console.warn(`[ANKI IMPORT] ${fieldName} is unreasonably large: ${num}`);
        return null;
    }
    return num;
}
/**
 * Converts Anki timestamp (seconds since epoch) to JavaScript Date.
 * Returns null if the timestamp is invalid.
 */
function ankiTimestampToDate(timestamp, fieldName) {
    const validated = validateTimestamp(timestamp, fieldName);
    if (validated === null)
        return null;
    // Anki timestamps are in seconds, JS Date needs milliseconds
    const ms = validated * 1000;
    const date = new Date(ms);
    // Verify the date is valid
    if (isNaN(date.getTime())) {
        console.warn(`[ANKI IMPORT] ${fieldName} produced invalid Date: ${timestamp}`);
        return null;
    }
    return date;
}
/**
 * Converts Anki day number (days since collection creation) to JavaScript Date.
 * Returns null if the inputs are invalid.
 */
function ankiDayNumberToDate(dayNumber, collectionCreationDate, fieldName) {
    const validated = validateTimestamp(dayNumber, fieldName);
    if (validated === null)
        return null;
    // Check collection creation date is valid
    if (isNaN(collectionCreationDate.getTime())) {
        console.warn(`[ANKI IMPORT] ${fieldName}: collectionCreationDate is invalid`);
        return null;
    }
    // Calculate the target date
    const ms = collectionCreationDate.getTime() + (validated * 24 * 60 * 60 * 1000);
    const date = new Date(ms);
    // Verify the date is valid
    if (isNaN(date.getTime())) {
        console.warn(`[ANKI IMPORT] ${fieldName} produced invalid Date: dayNumber=${dayNumber}, base=${collectionCreationDate.toISOString()}`);
        return null;
    }
    return date;
}
/**
 * Normalizes a due date based on Anki card state.
 * This is the CENTRAL function for all due date calculations.
 * Returns a valid Date or throws an error if normalization is impossible.
 */
function normalizeAnkiDueDate(card, collectionCreationDate, now) {
    // NEW CARDS (queue = 0)
    // 'due' field is just a sort order, not a date
    if (card.queue === 0) {
        return now;
    }
    // INTRADAY LEARNING (queue = 1)
    // 'due' is a TIMESTAMP in SECONDS
    if (card.queue === 1) {
        // Validate that due looks like a timestamp (> 1 billion = after year 2001)
        if (card.due > 1000000000) {
            const date = ankiTimestampToDate(card.due, "due (learning)");
            if (date)
                return date;
        }
        // Fallback: due now
        console.warn(`[ANKI IMPORT] Learning card with invalid due timestamp: ${card.due}, using now`);
        return now;
    }
    // DAY LEARNING (queue = 3)
    // 'due' is a DAY NUMBER since collection creation
    if (card.queue === 3) {
        const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (day learning)");
        if (date)
            return date;
        // Fallback: due now
        console.warn(`[ANKI IMPORT] Day learning card with invalid due day: ${card.due}, using now`);
        return now;
    }
    // REVIEW CARDS (queue = 2)
    // 'due' is a DAY NUMBER since collection creation
    if (card.queue === 2) {
        const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (review)");
        if (date)
            return date;
        // Fallback: due now
        console.warn(`[ANKI IMPORT] Review card with invalid due day: ${card.due}, using now`);
        return now;
    }
    // SUSPENDED / BURIED CARDS (queue < 0)
    // Use the same logic as review cards (due is day number)
    if (card.queue < 0) {
        const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (suspended/buried)");
        if (date)
            return date;
        // Fallback: due now
        console.warn(`[ANKI IMPORT] Suspended/buried card with invalid due day: ${card.due}, using now`);
        return now;
    }
    // UNKNOWN QUEUE STATE
    // Fallback to now
    console.warn(`[ANKI IMPORT] Unknown queue state: ${card.queue}, using now for due date`);
    return now;
}
/**
 * Validates all card data before insertion into database.
 * Returns an error message if validation fails, or null if valid.
 */
function validateCardData(card) {
    // Validate required strings
    if (!card.front || !card.front.trim()) {
        return "Front content is empty";
    }
    if (!card.back || !card.back.trim()) {
        return "Back content is empty";
    }
    // Validate state
    const validStates = ["new", "learning", "review", "suspended"];
    if (!validStates.includes(card.state)) {
        return `Invalid state: ${card.state}`;
    }
    // Validate due date
    if (!(card.dueAt instanceof Date) || isNaN(card.dueAt.getTime())) {
        return `Invalid due date: ${card.dueAt}`;
    }
    // Validate numeric fields
    if (typeof card.intervalDays !== "number" || isNaN(card.intervalDays)) {
        return `Invalid interval: ${card.intervalDays}`;
    }
    if (typeof card.ease !== "number" || isNaN(card.ease) || card.ease <= 0) {
        return `Invalid ease: ${card.ease}`;
    }
    if (typeof card.reps !== "number" || isNaN(card.reps) || card.reps < 0) {
        return `Invalid reps: ${card.reps}`;
    }
    if (typeof card.lapses !== "number" || isNaN(card.lapses) || card.lapses < 0) {
        return `Invalid lapses: ${card.lapses}`;
    }
    // All validations passed
    return null;
}
// Helper: Parse Anki deck hierarchy
// "Parent::Child::Grandchild" -> ["Parent", "Child", "Grandchild"]
function parseDeckName(deckName) {
    return deckName.split("::").map((part) => part.trim());
}
// Helper: Get or create deck with hierarchy
async function getOrCreateDeck(supabase, userId, deckPath, deckCache) {
    let parentId = null;
    for (let i = 0; i < deckPath.length; i++) {
        const deckName = deckPath[i];
        const fullPath = deckPath.slice(0, i + 1).join("::");
        // Check cache first
        if (deckCache.has(fullPath)) {
            parentId = deckCache.get(fullPath);
            continue;
        }
        // Check if deck exists
        const { data: existing } = await supabase
            .from("decks")
            .select("id")
            .eq("user_id", userId)
            .eq("name", deckName)
            .eq("parent_deck_id", parentId)
            .maybeSingle();
        if (existing) {
            parentId = existing.id;
            deckCache.set(fullPath, existing.id);
        }
        else {
            // Create new deck (always use "classic" mode for Anki imports)
            const { data: newDeck, error } = await supabase
                .from("decks")
                .insert({
                user_id: userId,
                name: deckName,
                parent_deck_id: parentId,
                mode: "classic",
            })
                .select("id")
                .single();
            if (error)
                throw error;
            if (newDeck) {
                parentId = newDeck.id;
                deckCache.set(fullPath, newDeck.id);
            }
        }
    }
    return parentId;
}
// Helper: Convert Anki interval to days
function getIntervalDays(ivl, type) {
    // ivl can be:
    // - negative for learning cards (seconds * -1)
    // - positive for review cards (days)
    if (type === 0)
        return 0; // New cards
    if (ivl < 0)
        return 0; // Learning cards (intraday)
    return ivl; // Review cards
}
// Helper: Map Anki card queue to Soma state
function getCardStateFromQueue(queue, type) {
    // IMPORTANT: Only truly suspended cards (-1) should be mapped to 'suspended'
    if (queue === -1)
        return "suspended"; // Permanently suspended
    // Buried cards: use 'type' field to determine underlying state
    if (queue === -2 || queue === -3) {
        if (type === 0)
            return "new";
        if (type === 1 || type === 3)
            return "learning";
        if (type === 2)
            return "review";
        return "review";
    }
    if (queue === 0)
        return "new";
    if (queue === 1 || queue === 3)
        return "learning"; // 1=learning, 3=day learning
    if (queue === 2)
        return "review";
    // Fallback: should never happen, but default to 'new'
    return "new";
}
// Helper: Decode HTML entities from Anki content
function decodeHtmlEntities(text) {
    if (!text)
        return text;
    const entities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&cent;': '¢',
        '&pound;': '£',
        '&yen;': '¥',
        '&euro;': '€',
        '&copy;': '©',
        '&reg;': '®',
    };
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.split(entity).join(char);
    }
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
        return String.fromCharCode(parseInt(dec, 10));
    });
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
    return decoded;
}
// Helper: Rewrite HTML to replace local media references with public URLs
function rewriteMediaUrls(html, mediaUrlMap) {
    if (!html || mediaUrlMap.size === 0)
        return html;
    let rewritten = html;
    rewritten = rewritten.replace(/<img([^>]*?)src=["']?([^"'>\s]+)["']?([^>]*?)>/gi, (match, before, src, after) => {
        const publicUrl = mediaUrlMap.get(src);
        if (publicUrl) {
            console.log(`[ANKI IMPORT] Rewriting image reference: ${src} → ${publicUrl}`);
            return `<img${before}src="${publicUrl}"${after}>`;
        }
        console.warn(`[ANKI IMPORT] No media file found for: ${src}`);
        return match;
    });
    return rewritten;
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
// POST /anki/import
router.post("/import", upload.single("file"), async (req, res) => {
    const importStart = Date.now();
    let tempPath;
    let ankiImportId;
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
        }
        if (!req.file.originalname.endsWith(".apkg")) {
            return res.status(400).json({ error: "File must be .apkg" });
        }
        // User is already authenticated by requireAuth middleware
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({
                error: "Unauthorized",
                details: "Auth session missing!",
            });
        }
        // Verify Supabase environment variables are set
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            console.error("[ANKI IMPORT] Missing Supabase environment variables");
            return res.status(500).json({
                error: "Server configuration error",
                details: "Supabase service key is missing. Please check your environment variables.",
            });
        }
        // Create Supabase admin client (bypasses RLS) for database operations
        const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        console.log("[ANKI IMPORT] START");
        // Create anki_imports record for progress tracking
        const { data: ankiImportRecord, error: ankiImportError } = await supabase
            .from("anki_imports")
            .insert({
            user_id: userId,
            filename: req.file.originalname,
            status: "pending",
            total_cards: 0,
            imported_cards: 0,
        })
            .select("id")
            .single();
        if (ankiImportError) {
            console.warn("[ANKI IMPORT] Failed to create progress record:", ankiImportError);
        }
        else {
            ankiImportId = ankiImportRecord?.id;
            console.log("[ANKI IMPORT] Created progress record:", ankiImportId);
        }
        // Helper to update progress (non-blocking)
        const updateProgress = async (updates) => {
            if (!ankiImportId)
                return;
            try {
                await supabase
                    .from("anki_imports")
                    .update({ ...updates, updated_at: new Date().toISOString() })
                    .eq("id", ankiImportId);
            }
            catch (e) {
                console.warn("[ANKI IMPORT] Failed to update progress:", e);
            }
        };
        // Mark as running
        await updateProgress({ status: "running" });
        // Read file as buffer (multer already provides Buffer)
        const buffer = req.file.buffer;
        const zipStart = Date.now();
        const zip = new adm_zip_1.default(buffer);
        console.log("[ANKI IMPORT] Zip loaded in ms:", Date.now() - zipStart);
        // Verify that the storage bucket exists before attempting upload
        console.log("[ANKI IMPORT] Verifying storage bucket...");
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        if (bucketsError) {
            console.error("[ANKI IMPORT] ❌ Failed to list storage buckets:", bucketsError);
        }
        else {
            const cardMediaBucket = buckets?.find((b) => b.name === "card-media");
            if (!cardMediaBucket) {
                console.error("[ANKI IMPORT] 🚨 CRITICAL: Storage bucket 'card-media' NOT FOUND!");
                console.error("[ANKI IMPORT] 🚨 Images will NOT work without this bucket!");
            }
            else {
                console.log("[ANKI IMPORT] ✅ Storage bucket 'card-media' found", {
                    id: cardMediaBucket.id,
                    public: cardMediaBucket.public,
                    createdAt: cardMediaBucket.created_at,
                });
            }
        }
        // Debug: List all files in the .apkg
        const entries = zip.getEntries();
        console.log("[ANKI IMPORT] Files in .apkg:", entries.map((e) => ({
            name: e.entryName,
            size: e.header.size,
            compressedSize: e.header.compressedSize,
        })));
        // Parse the Anki media mapping file (maps numeric names to original filenames)
        let ankiMediaMap = {};
        const mediaJsonEntry = zip.getEntry("media");
        if (mediaJsonEntry) {
            try {
                const mediaJsonStr = mediaJsonEntry.getData().toString("utf-8");
                ankiMediaMap = JSON.parse(mediaJsonStr);
                console.log("[ANKI IMPORT] Parsed media mapping:", Object.keys(ankiMediaMap).length, "entries");
            }
            catch (e) {
                console.warn("[ANKI IMPORT] Failed to parse media mapping file:", e);
            }
        }
        // Extract and upload media files (images)
        const mediaExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"];
        // Build list of media files to upload, handling both numeric-named and extension-named files
        const mediaFilesToUpload = [];
        for (const entry of entries) {
            if (entry.isDirectory)
                continue;
            const name = entry.entryName;
            // Check if this is a numeric-named file mapped in the media JSON
            if (ankiMediaMap[name]) {
                const originalName = ankiMediaMap[name];
                if (mediaExtensions.some((ext) => originalName.toLowerCase().endsWith(ext))) {
                    mediaFilesToUpload.push({ entry, originalName });
                }
                continue;
            }
            // Also handle files that already have proper extensions (non-standard .apkg)
            if (mediaExtensions.some((ext) => name.toLowerCase().endsWith(ext))) {
                mediaFilesToUpload.push({ entry, originalName: name });
            }
        }
        console.log("[ANKI IMPORT] Found", mediaFilesToUpload.length, "media files");
        // Map of original filename → public URL
        const mediaUrlMap = new Map();
        const mediaUploadStart = Date.now();
        // Limit concurrent uploads to avoid overloading storage
        const CONCURRENCY = 5;
        const uploadQueue = [...mediaFilesToUpload];
        const workers = [];
        const uploadNext = async () => {
            while (uploadQueue.length > 0) {
                const item = uploadQueue.shift();
                if (!item)
                    break;
                try {
                    const { entry, originalName } = item;
                    const fileData = entry.getData();
                    // Determine content type from the original filename's extension
                    const ext = originalName.toLowerCase().match(/\.(\w+)$/)?.[1] || "png";
                    const contentTypeMap = {
                        png: "image/png",
                        jpg: "image/jpeg",
                        jpeg: "image/jpeg",
                        gif: "image/gif",
                        svg: "image/svg+xml",
                        webp: "image/webp",
                        bmp: "image/bmp",
                        ico: "image/x-icon",
                    };
                    const contentType = contentTypeMap[ext] || "image/png";
                    // Upload to Supabase Storage using the original filename
                    const storagePath = `${userId}/anki-media/${originalName}`;
                    const { error: uploadError } = await supabase.storage
                        .from("card-media")
                        .upload(storagePath, fileData, {
                        contentType,
                        upsert: true,
                    });
                    if (uploadError) {
                        console.error(`[ANKI IMPORT] ❌ Failed to upload ${originalName}:`, uploadError);
                        continue;
                    }
                    // Get public URL and map the original filename
                    const { data: urlData } = supabase.storage.from("card-media").getPublicUrl(storagePath);
                    if (urlData?.publicUrl) {
                        mediaUrlMap.set(originalName, urlData.publicUrl);
                    }
                }
                catch (error) {
                    console.error("[ANKI IMPORT] Error processing media file:", error);
                }
            }
        };
        for (let i = 0; i < CONCURRENCY; i++) {
            workers.push(uploadNext());
        }
        await Promise.all(workers);
        console.log("[ANKI IMPORT] Media upload complete", {
            uploaded: mediaUrlMap.size,
            total: mediaFilesToUpload.length,
        }, "in ms:", Date.now() - mediaUploadStart);
        // Try different collection file names
        let collectionEntry = zip.getEntry("collection.anki21");
        if (!collectionEntry) {
            collectionEntry = zip.getEntry("collection.anki22");
        }
        if (!collectionEntry) {
            collectionEntry = zip.getEntry("collection.anki2");
        }
        if (!collectionEntry) {
            return res.status(400).json({
                error: `Invalid .apkg file: no collection file found. Files in archive: ${entries.map((e) => e.entryName).join(", ")}`,
            });
        }
        console.log("[ANKI IMPORT] Using collection file:", collectionEntry.entryName);
        // Extract to temp file with unique name (cross-platform)
        tempPath = (0, path_1.join)((0, os_1.tmpdir)(), `anki-${(0, crypto_1.randomUUID)()}.anki2`);
        const collectionData = collectionEntry.getData();
        await fs_1.promises.writeFile(tempPath, collectionData);
        const dbOpenStart = Date.now();
        const db = new better_sqlite3_1.default(tempPath);
        console.log("[ANKI IMPORT] Opened SQLite DB in ms:", Date.now() - dbOpenStart);
        try {
            // Debug: List all tables in the database
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log("[ANKI IMPORT] Tables in database:", tables.map((t) => t.name));
            // Check which collection table exists
            const hasCol = tables.some((t) => t.name === "col");
            if (!hasCol) {
                throw new Error(`Unsupported Anki format. Found tables: ${tables.map((t) => t.name).join(", ")}`);
            }
            // Get decks and creation time from collection
            const colRow = db.prepare("SELECT decks, crt FROM col").get();
            if (!colRow) {
                throw new Error("Failed to read collection metadata from Anki database");
            }
            const decksJson = JSON.parse(colRow.decks);
            // CRITICAL: Validate collection creation timestamp before using it
            const collectionCreationDate = ankiTimestampToDate(colRow.crt, "collection.crt");
            if (!collectionCreationDate) {
                throw new Error(`Invalid collection creation timestamp in Anki database: ${colRow.crt}`);
            }
            console.log("[ANKI IMPORT] Collection created:", collectionCreationDate.toISOString());
            // Get notes and cards
            const notesQueryStart = Date.now();
            const notes = db.prepare("SELECT id, mid, flds, tags FROM notes").all();
            console.log("[ANKI IMPORT] Loaded notes in ms:", Date.now() - notesQueryStart, "count:", notes.length);
            const cardsQueryStart = Date.now();
            const cards = db.prepare(`
        SELECT id, nid, did, type, queue, ivl, factor, reps, lapses, due
        FROM cards
      `).all();
            console.log("[ANKI IMPORT] Loaded cards in ms:", Date.now() - cardsQueryStart, "count:", cards.length);
            // Update total_cards for progress tracking
            await updateProgress({ total_cards: cards.length });
            // Build deck cache
            const deckCache = new Map();
            const ankiDeckIdToSomaDeckId = new Map();
            const deckCreateStart = Date.now();
            // Create decks with hierarchy
            for (const [deckId, deckData] of Object.entries(decksJson)) {
                const ankiDeckId = Number(deckId);
                const deckName = deckData.name;
                // Skip the default deck (ID: 1)
                if (ankiDeckId === 1) {
                    console.log(`[ANKI IMPORT] Skipping Anki default deck ${deckId} ("${deckName}")`);
                    continue;
                }
                const deckPath = parseDeckName(deckName);
                const somaDeckId = await getOrCreateDeck(supabase, userId, deckPath, deckCache);
                ankiDeckIdToSomaDeckId.set(ankiDeckId, somaDeckId);
            }
            console.log("[ANKI IMPORT] Deck hierarchy created in ms:", Date.now() - deckCreateStart, "decks:", deckCache.size);
            // Build note lookup
            const noteMap = new Map(notes.map((n) => [n.id, n]));
            // Import cards
            let importedCount = 0;
            let skippedNoNote = 0;
            let skippedNoDeck = 0;
            let skippedEmptyFields = 0;
            let skippedDefaultDeck = 0;
            let failedInserts = 0;
            const now = new Date();
            const cardRowsToInsert = [];
            const buildCardsStart = Date.now();
            for (const card of cards) {
                const note = noteMap.get(card.nid);
                if (!note) {
                    skippedNoNote++;
                    continue;
                }
                // Skip cards from the default deck (ID: 1)
                if (card.did === 1) {
                    skippedDefaultDeck++;
                    continue;
                }
                const somaDeckId = ankiDeckIdToSomaDeckId.get(card.did);
                if (!somaDeckId) {
                    skippedNoDeck++;
                    continue;
                }
                // Parse note fields (separated by \x1f)
                const fields = note.flds.split("\x1f");
                // Decode HTML entities from Anki
                let front = decodeHtmlEntities(fields[0] || "");
                let back = decodeHtmlEntities(fields[1] || "");
                // Rewrite media URLs to point to Supabase Storage
                front = rewriteMediaUrls(front, mediaUrlMap);
                back = rewriteMediaUrls(back, mediaUrlMap);
                if (!front.trim() || !back.trim()) {
                    skippedEmptyFields++;
                    continue;
                }
                // Calculate due date and state based on Anki card queue
                const state = getCardStateFromQueue(card.queue, card.type);
                const intervalDays = getIntervalDays(card.ivl, card.type);
                const dueAt = normalizeAnkiDueDate(card, collectionCreationDate, now);
                const isSuspended = card.queue === -1;
                // Calculate ease factor with validation
                let ease = 2.5;
                if (card.factor && typeof card.factor === "number" && card.factor > 0) {
                    ease = card.factor / 1000;
                    if (ease < 1.3 || ease > 5.0) {
                        ease = 2.5;
                    }
                }
                const reps = typeof card.reps === "number" && card.reps >= 0 ? card.reps : 0;
                const lapses = typeof card.lapses === "number" && card.lapses >= 0 ? card.lapses : 0;
                // CRITICAL: Validate all data before insertion
                const validationError = validateCardData({
                    front,
                    back,
                    state,
                    dueAt,
                    intervalDays,
                    ease,
                    reps,
                    lapses,
                });
                if (validationError) {
                    failedInserts++;
                    continue;
                }
                // Collect card row for batch insert
                cardRowsToInsert.push({
                    user_id: userId,
                    deck_id: somaDeckId,
                    front,
                    back,
                    state,
                    due_at: dueAt.toISOString(),
                    interval_days: intervalDays,
                    ease,
                    reps,
                    lapses,
                    learning_step_index: 0,
                    suspended: isSuspended,
                });
            }
            console.log("[ANKI IMPORT] Prepared card rows in ms:", Date.now() - buildCardsStart, "rows:", cardRowsToInsert.length);
            // Batch insert cards to minimize round-trips
            const BATCH_SIZE = 200;
            const insertStart = Date.now();
            for (let i = 0; i < cardRowsToInsert.length; i += BATCH_SIZE) {
                const batch = cardRowsToInsert.slice(i, i + BATCH_SIZE);
                const { error: batchError } = await supabase.from("cards").insert(batch);
                if (batchError) {
                    failedInserts += batch.length;
                    console.error("[ANKI IMPORT] Batch insert failed:", {
                        index: i,
                        size: batch.length,
                        error: batchError,
                    });
                }
                else {
                    importedCount += batch.length;
                }
                // Update progress after each batch (non-blocking)
                updateProgress({ imported_cards: importedCount });
            }
            console.log("[ANKI IMPORT] Inserted cards in ms:", Date.now() - insertStart, "imported:", importedCount);
            console.log("[ANKI IMPORT] Import summary:", {
                total: cards.length,
                imported: importedCount,
                skippedNoNote,
                skippedNoDeck,
                skippedDefaultDeck,
                skippedEmptyFields,
                failedInserts,
                durationMs: Date.now() - importStart,
            });
            // CRITICAL: Check if too many cards failed
            const totalProcessed = cards.length - skippedDefaultDeck;
            const failureRate = totalProcessed > 0 ? failedInserts / totalProcessed : 0;
            if (failureRate > 0.1) {
                const errorMsg = `Import failed: ${failedInserts} out of ${totalProcessed} cards failed validation or insertion (${(failureRate * 100).toFixed(1)}%). This indicates a serious problem with the .apkg file or import logic.`;
                console.error("[ANKI IMPORT] CRITICAL:", errorMsg);
                throw new Error(errorMsg);
            }
            if (failedInserts > 0) {
                console.warn(`[ANKI IMPORT] WARNING: ${failedInserts} cards failed to import.`);
            }
            db.close();
            // Clean up temp file
            if (tempPath) {
                try {
                    await fs_1.promises.unlink(tempPath);
                }
                catch (e) {
                    console.warn(`[ANKI IMPORT] Failed to clean up temp file: ${e}`);
                }
            }
            // Mark import as done
            await updateProgress({ status: "done", imported_cards: importedCount });
            return res.json({
                success: true,
                imported: importedCount,
                decks: deckCache.size,
                ankiImportId,
                warnings: failedInserts > 0 ? [`${failedInserts} cards failed to import`] : undefined,
            });
        }
        finally {
            // Ensure database is closed
            if (db.open) {
                db.close();
            }
            // Ensure temp file is cleaned up even if DB operations fail
            if (tempPath) {
                try {
                    await fs_1.promises.unlink(tempPath);
                }
                catch (e) {
                    console.warn(`[ANKI IMPORT] Failed to clean up temp file in finally: ${e}`);
                }
            }
        }
    }
    catch (error) {
        console.error("❌ [ANKI IMPORT] Fatal error:", error);
        let errorMessage = "Import failed";
        let statusCode = 500;
        if (error instanceof Error) {
            errorMessage = error.message;
            if (errorMessage.includes("Invalid collection creation timestamp")) {
                errorMessage = "The Anki file appears to be corrupted (invalid collection timestamp). Please try exporting it again from Anki.";
            }
            else if (errorMessage.includes("Invalid time value")) {
                errorMessage = "The Anki file contains invalid date values. This may be due to a corrupted export or an unsupported Anki version.";
            }
            else if (errorMessage.includes("Unsupported Anki format")) {
                errorMessage = "This Anki file format is not supported. Please ensure you're using Anki 2.0 or later.";
            }
            else if (errorMessage.includes("Failed to read collection metadata")) {
                errorMessage = "Unable to read Anki collection data. The file may be corrupted.";
            }
            else if (errorMessage.includes("Unauthorized")) {
                errorMessage = "Authentication failed. Please log in again.";
                statusCode = 401;
            }
            else if (errorMessage.includes("Server configuration error")) {
                errorMessage = "Server is not configured properly. Please contact support.";
                statusCode = 503;
            }
            else if (errorMessage.includes("cards failed validation")) {
                statusCode = 400;
            }
        }
        // Mark import as error if we have an import ID
        if (ankiImportId) {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && serviceKey) {
                const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceKey, {
                    auth: { autoRefreshToken: false, persistSession: false },
                });
                await supabase
                    .from("anki_imports")
                    .update({ status: "error", error_message: errorMessage, updated_at: new Date().toISOString() })
                    .eq("id", ankiImportId);
            }
        }
        return res.status(statusCode).json({
            error: errorMessage,
            ankiImportId,
            details: error instanceof Error ? error.stack : undefined,
        });
    }
});
exports.default = router;
//# sourceMappingURL=anki.js.map