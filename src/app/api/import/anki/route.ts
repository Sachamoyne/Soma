import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

// ============================================================================
// CRITICAL: Date Normalization Functions
// These functions prevent "Invalid time value" errors by validating all dates
// ============================================================================

/**
 * Validates and normalizes a timestamp value.
 * Returns null if the value is invalid, otherwise returns the normalized timestamp.
 */
function validateTimestamp(value: any, fieldName: string): number | null {
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
function ankiTimestampToDate(timestamp: any, fieldName: string): Date | null {
  const validated = validateTimestamp(timestamp, fieldName);
  if (validated === null) return null;

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
function ankiDayNumberToDate(
  dayNumber: any,
  collectionCreationDate: Date,
  fieldName: string
): Date | null {
  const validated = validateTimestamp(dayNumber, fieldName);
  if (validated === null) return null;

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
function normalizeAnkiDueDate(
  card: {
    queue: number;
    due: number;
    type: number;
  },
  collectionCreationDate: Date,
  now: Date
): Date {
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
      if (date) return date;
    }
    // Fallback: due now
    console.warn(`[ANKI IMPORT] Learning card with invalid due timestamp: ${card.due}, using now`);
    return now;
  }

  // DAY LEARNING (queue = 3)
  // 'due' is a DAY NUMBER since collection creation
  if (card.queue === 3) {
    const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (day learning)");
    if (date) return date;
    // Fallback: due now
    console.warn(`[ANKI IMPORT] Day learning card with invalid due day: ${card.due}, using now`);
    return now;
  }

  // REVIEW CARDS (queue = 2)
  // 'due' is a DAY NUMBER since collection creation
  if (card.queue === 2) {
    const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (review)");
    if (date) return date;
    // Fallback: due now
    console.warn(`[ANKI IMPORT] Review card with invalid due day: ${card.due}, using now`);
    return now;
  }

  // SUSPENDED / BURIED CARDS (queue < 0)
  // Use the same logic as review cards (due is day number)
  if (card.queue < 0) {
    const date = ankiDayNumberToDate(card.due, collectionCreationDate, "due (suspended/buried)");
    if (date) return date;
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
function validateCardData(card: {
  front: string;
  back: string;
  state: string;
  dueAt: Date;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}): string | null {
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
function parseDeckName(deckName: string): string[] {
  return deckName.split("::").map((part) => part.trim());
}

// Helper: Get or create deck with hierarchy
async function getOrCreateDeck(
  supabase: any,
  userId: string,
  deckPath: string[],
  deckCache: Map<string, string>
): Promise<string> {
  let parentId: string | null = null;

  for (let i = 0; i < deckPath.length; i++) {
    const deckName = deckPath[i];
    const fullPath = deckPath.slice(0, i + 1).join("::");

    // Check cache first
    if (deckCache.has(fullPath)) {
      parentId = deckCache.get(fullPath)!;
      continue;
    }

    // Check if deck exists
    const { data: existing }: { data: { id: string } | null } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("name", deckName)
      .eq("parent_deck_id", parentId)
      .maybeSingle();

    if (existing) {
      parentId = existing.id;
      deckCache.set(fullPath, existing.id);
    } else {
      // Create new deck
      const { data: newDeck, error }: { data: { id: string } | null; error: any } = await supabase
        .from("decks")
        .insert({
          user_id: userId,
          name: deckName,
          parent_deck_id: parentId,
        })
        .select("id")
        .single();

      if (error) throw error;
      if (newDeck) {
        parentId = newDeck.id;
        deckCache.set(fullPath, newDeck.id);
      }
    }
  }

  return parentId!;
}

// Helper: Convert Anki card type to ease factor
function getEaseFromType(type: number): number {
  // type: 0=new, 1=learning, 2=review, 3=relearning
  // Default ease is 2.5 (250%)
  return 2.5;
}

// Helper: Convert Anki interval to days
function getIntervalDays(ivl: number, type: number): number {
  // ivl can be:
  // - negative for learning cards (seconds * -1)
  // - positive for review cards (days)
  if (type === 0) return 0; // New cards
  if (ivl < 0) return 0; // Learning cards (intraday)
  return ivl; // Review cards
}

// Helper: Map Anki card queue to Soma state
// CRITICAL: Use queue (current state), NOT type (historical state)
// Exception: For buried cards, use type to determine underlying state
// Anki queue values:
// - 0 = new
// - 1 = learning (intraday)
// - 2 = review (due)
// - 3 = day learning (relearning)
// - -1 = suspended (manually suspended by user)
// - -2 = user buried (hidden for today, auto-unsuspended tomorrow)
// - -3 = scheduler buried (sibling cards, auto-unsuspended tomorrow)
function getCardStateFromQueue(
  queue: number,
  type?: number // Anki card type: 0=new, 1=learning, 2=review, 3=relearning
): "new" | "learning" | "review" | "suspended" {
  // IMPORTANT: Only truly suspended cards (-1) should be mapped to 'suspended'
  if (queue === -1) return "suspended"; // Permanently suspended

  // Buried cards: use 'type' field to determine underlying state
  // They are temporarily hidden but retain their original state
  if (queue === -2 || queue === -3) {
    if (type === 0) return "new";
    if (type === 1 || type === 3) return "learning";
    if (type === 2) return "review";
    // Fallback: assume review (most common)
    return "review";
  }

  if (queue === 0) return "new";
  if (queue === 1 || queue === 3) return "learning"; // 1=learning, 3=day learning
  if (queue === 2) return "review";

  // Fallback: should never happen, but default to 'new'
  return "new";
}

// DEPRECATED: Do not use - type is historical, not current state
function getCardState(type: number): "new" | "learning" | "review" {
  // type: 0=new, 1=learning, 2=review, 3=relearning
  if (type === 0) return "new";
  if (type === 1 || type === 3) return "learning";
  return "review";
}

// Helper: Decode HTML entities from Anki content
// Anki stores content with HTML entities (&nbsp;, &lt;, &gt;, etc.)
// We need to decode them to display correctly in Soma
function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  // Common HTML entities used in Anki
  const entities: Record<string, string> = {
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

  // Replace all known entities
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }

  // Decode numeric entities (&#123; or &#xAB;)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  return decoded;
}

// Helper: Rewrite HTML to replace local media references with public URLs
// Anki cards reference media like: <img src="image-123.png">
// We need to replace with: <img src="https://storage-url/image-123.png">
function rewriteMediaUrls(html: string, mediaUrlMap: Map<string, string>): string {
  if (!html || mediaUrlMap.size === 0) return html;

  // Replace <img src="filename"> with <img src="public-url">
  // Match both single and double quotes, and handle various formats
  let rewritten = html;

  // Pattern matches:
  // - <img src="filename.png">
  // - <img src='filename.png'>
  // - <img src=filename.png> (no quotes)
  // Also handles attributes before/after src
  rewritten = rewritten.replace(
    /<img([^>]*?)src=["']?([^"'>\s]+)["']?([^>]*?)>/gi,
    (match, before, src, after) => {
      // Check if this filename exists in our media map
      const publicUrl = mediaUrlMap.get(src);
      if (publicUrl) {
        console.log(`[ANKI IMPORT] Rewriting image reference: ${src} → ${publicUrl}`);
        return `<img${before}src="${publicUrl}"${after}>`;
      }
      // No match found - return original (will show ❓)
      console.warn(`[ANKI IMPORT] No media file found for: ${src}`);
      return match;
    }
  );

  return rewritten;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".apkg")) {
      return NextResponse.json({ error: "File must be .apkg" }, { status: 400 });
    }

    // WORKAROUND: Supabase SSR v0.1.0 has issues with getUser() in Route Handlers
    // Read and validate the auth cookie manually
    const requestCookies = request.cookies.getAll();
    const sbCookie = requestCookies.find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

    let userId: string | null = null;

    if (sbCookie) {
      try {
        const cookieValue = JSON.parse(sbCookie.value);

        if (cookieValue.access_token) {
          // Decode JWT to extract and validate user ID
          const parts = cookieValue.access_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const now = Math.floor(Date.now() / 1000);

            // Verify token is not expired
            if (payload.exp && payload.exp > now && payload.sub) {
              userId = payload.sub;
            }
          }
        }
      } catch (e) {
        console.error("[ANKI IMPORT] Failed to parse auth cookie:", e);
      }
    }

    if (!userId) {
      return NextResponse.json({
        error: "Unauthorized",
        details: "Auth session missing!"
      }, { status: 401 });
    }

    // Verify Supabase environment variables are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("[ANKI IMPORT] Missing Supabase environment variables");
      return NextResponse.json({
        error: "Server configuration error",
        details: "Supabase service key is missing. Please check your environment variables."
      }, { status: 500 });
    }

    // Create Supabase admin client (bypasses RLS) for database operations
    // This is safe because we already validated the user's JWT above
    const supabase = createSupabaseClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Read file as buffer
    const buffer = await file.arrayBuffer();
    const zip = new AdmZip(Buffer.from(buffer));

    // Verify that the storage bucket exists before attempting upload
    console.log("[ANKI IMPORT] Verifying storage bucket...");
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("[ANKI IMPORT] ❌ Failed to list storage buckets:", bucketsError);
    } else {
      const cardMediaBucket = buckets?.find(b => b.name === 'card-media');
      if (!cardMediaBucket) {
        console.error("[ANKI IMPORT] 🚨 CRITICAL: Storage bucket 'card-media' NOT FOUND!");
        console.error("[ANKI IMPORT] 🚨 Images will NOT work without this bucket!");
        console.error("[ANKI IMPORT] 🚨 CREATE IT NOW:");
        console.error("[ANKI IMPORT] 🚨   1. Go to Supabase Dashboard → Storage");
        console.error("[ANKI IMPORT] 🚨   2. Click 'New bucket'");
        console.error("[ANKI IMPORT] 🚨   3. Name: 'card-media'");
        console.error("[ANKI IMPORT] 🚨   4. Public: ON");
        console.error("[ANKI IMPORT] 🚨   5. Click 'Create bucket'");
      } else {
        console.log("[ANKI IMPORT] ✅ Storage bucket 'card-media' found", {
          id: cardMediaBucket.id,
          public: cardMediaBucket.public,
          createdAt: cardMediaBucket.created_at
        });

        if (!cardMediaBucket.public) {
          console.warn("[ANKI IMPORT] ⚠️ WARNING: Bucket 'card-media' is NOT PUBLIC!");
          console.warn("[ANKI IMPORT] ⚠️ Images may not be accessible!");
          console.warn("[ANKI IMPORT] ⚠️ Make it public in Supabase Dashboard → Storage → card-media → Settings");
        }
      }
    }

    // Debug: List all files in the .apkg
    const entries = zip.getEntries();
    console.log("[ANKI IMPORT] Files in .apkg:", entries.map(e => ({
      name: e.entryName,
      size: e.header.size,
      compressedSize: e.header.compressedSize
    })));

    // Extract and upload media files (images)
    const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
    const mediaFiles = entries.filter(entry => {
      const name = entry.entryName.toLowerCase();
      return !entry.isDirectory && mediaExtensions.some(ext => name.endsWith(ext));
    });

    console.log("[ANKI IMPORT] Found", mediaFiles.length, "media files");

    // Map of original filename → public URL
    const mediaUrlMap = new Map<string, string>();

    for (const mediaFile of mediaFiles) {
      try {
        const fileName = mediaFile.entryName;
        const fileData = mediaFile.getData();

        // Determine content type from extension
        const ext = fileName.toLowerCase().match(/\.(\w+)$/)?.[1] || 'png';
        const contentTypeMap: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'svg': 'image/svg+xml',
          'webp': 'image/webp',
          'bmp': 'image/bmp',
          'ico': 'image/x-icon'
        };
        const contentType = contentTypeMap[ext] || 'image/png';

        // Upload to Supabase Storage
        // Path: {userId}/anki-media/{fileName}
        const storagePath = `${userId}/anki-media/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('card-media')
          .upload(storagePath, fileData, {
            contentType,
            upsert: true, // Replace if exists
          });

        if (uploadError) {
          const statusCode = (uploadError as unknown as { statusCode?: string }).statusCode;
          console.error(`[ANKI IMPORT] ❌ Failed to upload ${fileName}:`, {
            error: uploadError,
            message: uploadError.message,
            statusCode,
            bucket: 'card-media',
            path: storagePath
          });

          // CRITICAL: If bucket doesn't exist, this will fail with 404
          if (statusCode === '404' || uploadError.message?.includes('Bucket not found')) {
            console.error(`[ANKI IMPORT] 🚨 BUCKET 'card-media' DOES NOT EXIST!`);
            console.error(`[ANKI IMPORT] 🚨 CREATE IT: Supabase Dashboard → Storage → Create bucket 'card-media' (public)`);
          }

          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('card-media')
          .getPublicUrl(storagePath);

        if (urlData?.publicUrl) {
          mediaUrlMap.set(fileName, urlData.publicUrl);
          console.log(`[ANKI IMPORT] Uploaded ${fileName} → ${urlData.publicUrl}`);
        }
      } catch (error) {
        console.error(`[ANKI IMPORT] Error processing media file ${mediaFile.entryName}:`, error);
      }
    }

    console.log(`[ANKI IMPORT] Successfully uploaded ${mediaUrlMap.size} / ${mediaFiles.length} media files`);

    // Try different collection file names (prioritize newer formats)
    // Anki 2.1.50+ exports both collection.anki21 (new) and collection.anki2 (legacy compatibility)
    // We must use collection.anki21 which contains the actual data
    let collectionEntry = zip.getEntry("collection.anki21");
    if (!collectionEntry) {
      collectionEntry = zip.getEntry("collection.anki22");
    }
    if (!collectionEntry) {
      collectionEntry = zip.getEntry("collection.anki2");
    }

    if (!collectionEntry) {
      return NextResponse.json(
        { error: `Invalid .apkg file: no collection file found. Files in archive: ${entries.map(e => e.entryName).join(', ')}` },
        { status: 400 }
      );
    }

    console.log("[ANKI IMPORT] Using collection file:", collectionEntry.entryName);

    // Extract to temp file with unique name (cross-platform)
    const tempPath = join(tmpdir(), `anki-${randomUUID()}.anki2`);
    const collectionData = collectionEntry.getData();
    const fs = require("fs");
    fs.writeFileSync(tempPath, collectionData);

    const db = new Database(tempPath);

    try {
      // Debug: List all tables in the database
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      console.log("[ANKI IMPORT] Tables in database:", tables.map(t => t.name));

      // For each table, show sample data
      for (const table of tables) {
        try {
          const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
          console.log(`[ANKI IMPORT] Table ${table.name}: ${count.count} rows`);

          if (count.count > 0 && count.count <= 3) {
            const sample = db.prepare(`SELECT * FROM ${table.name} LIMIT 1`).get();
            console.log(`[ANKI IMPORT] Sample from ${table.name}:`, sample);
          }
        } catch (e) {
          console.log(`[ANKI IMPORT] Error reading ${table.name}:`, e);
        }
      }

      // Check which collection table exists
      const hasCol = tables.some(t => t.name === 'col');
      const hasNotetypes = tables.some(t => t.name === 'notetypes');
      console.log("[ANKI IMPORT] Database version:", hasNotetypes ? 'Anki 2.1.50+' : (hasCol ? 'Anki 2.0/2.1' : 'Unknown'));

      if (!hasCol) {
        throw new Error(`Unsupported Anki format. Found tables: ${tables.map(t => t.name).join(', ')}`);
      }

      // Get decks and creation time from collection
      const colRow = db.prepare("SELECT decks, crt FROM col").get() as { decks: string; crt: number };

      if (!colRow) {
        throw new Error("Failed to read collection metadata from Anki database");
      }

      const decksJson = JSON.parse(colRow.decks);

      // CRITICAL: Validate collection creation timestamp before using it
      // This timestamp is the basis for all due date calculations
      const collectionCreationDate = ankiTimestampToDate(colRow.crt, "collection.crt");

      if (!collectionCreationDate) {
        throw new Error(`Invalid collection creation timestamp in Anki database: ${colRow.crt}`);
      }

      const currentDayNumber = Math.floor((Date.now() - collectionCreationDate.getTime()) / (24 * 60 * 60 * 1000));

      console.log("[ANKI IMPORT] Collection created:", collectionCreationDate.toISOString());
      console.log("[ANKI IMPORT] Current Anki day number:", currentDayNumber);

      // Get notes and cards
      const notes = db.prepare("SELECT id, mid, flds, tags FROM notes").all() as Array<{
        id: number;
        mid: number;
        flds: string;
        tags: string;
      }>;

      const cards = db.prepare(`
        SELECT id, nid, did, type, queue, ivl, factor, reps, lapses, due
        FROM cards
      `).all() as Array<{
        id: number;
        nid: number;
        did: number;
        type: number;
        queue: number;
        ivl: number;
        factor: number;
        reps: number;
        lapses: number;
        due: number;
      }>;

      console.log("[ANKI IMPORT] Read from Anki DB:", { notes: notes.length, cards: cards.length });

      // Debug: Show distribution of queue values (actual card states in Anki)
      const queueDistribution = new Map<number, number>();
      for (const card of cards) {
        queueDistribution.set(card.queue, (queueDistribution.get(card.queue) || 0) + 1);
      }
      console.log("[ANKI IMPORT] Anki queue distribution:");
      console.log("  (0=new, 1=learning, 2=review, 3=day learning, -1=suspended, -2=user buried, -3=sched buried)");
      for (const [queue, count] of Array.from(queueDistribution.entries()).sort((a, b) => a[0] - b[0])) {
        const queueName = queue === 0 ? "new" :
                         queue === 1 ? "learning" :
                         queue === 2 ? "review" :
                         queue === 3 ? "day learning" :
                         queue === -1 ? "suspended" :
                         queue === -2 ? "user buried" :
                         queue === -3 ? "sched buried" :
                         `unknown(${queue})`;
        console.log(`  queue ${queue} (${queueName}): ${count} cards`);
      }

      // Build deck cache
      const deckCache = new Map<string, string>();
      const ankiDeckIdToSomaDeckId = new Map<number, string>();

      // Debug: Show all Anki decks
      console.log("[ANKI IMPORT] Anki decks from database:");
      for (const [deckId, deckData] of Object.entries(decksJson)) {
        console.log(`  - Anki ID ${deckId}: ${(deckData as any).name}`);
      }

      // Create decks with hierarchy
      // IMPORTANT: Skip Anki's default deck (ID: 1, name: "Default" or "Par défaut")
      // This deck is auto-created by Anki and is usually empty
      for (const [deckId, deckData] of Object.entries(decksJson)) {
        const ankiDeckId = Number(deckId);
        const deckName = (deckData as any).name as string;

        // Skip the default deck (ID: 1)
        if (ankiDeckId === 1) {
          console.log(`[ANKI IMPORT] Skipping Anki default deck ${deckId} ("${deckName}")`);
          continue;
        }

        const deckPath = parseDeckName(deckName);
        const somaDeckId = await getOrCreateDeck(supabase, userId, deckPath, deckCache);
        ankiDeckIdToSomaDeckId.set(ankiDeckId, somaDeckId);

        // Debug: Show mapping
        console.log(`[ANKI IMPORT] Mapped Anki deck ${deckId} ("${deckName}") → Soma deck ${somaDeckId} (leaf: "${deckPath[deckPath.length - 1]}")`);
      }

      // Debug: Show all created decks with Anki deck ID mapping
      console.log("[ANKI IMPORT] All Soma decks created (with Anki ID mapping):");
      for (const [fullPath, somaDeckId] of deckCache.entries()) {
        // Find corresponding Anki deck ID(s) for this Soma deck
        const ankiDeckIds: number[] = [];
        for (const [ankiId, somaId] of ankiDeckIdToSomaDeckId.entries()) {
          if (somaId === somaDeckId) {
            ankiDeckIds.push(ankiId);
          }
        }
        console.log(`  - "${fullPath}" (Soma: ${somaDeckId}, Anki: ${ankiDeckIds.join(', ') || 'none'})`);
      }

      // Build note lookup
      const noteMap = new Map(notes.map((n) => [n.id, n]));

      // Import cards
      let importedCount = 0;
      let skippedNoNote = 0;
      let skippedNoDeck = 0;
      let skippedEmptyFields = 0;
      let skippedDefaultDeck = 0; // Track cards skipped from Anki's default deck
      let failedInserts = 0;
      const now = new Date();
      const cardsPerDeck = new Map<string, number>(); // Track cards per Soma deck
      const cardsByState = { new: 0, learning: 0, review: 0 }; // Track cards by state
      let suspendedCount = 0; // Track suspended cards (-1)
      let buriedCount = 0; // Track buried cards (-2, -3) imported as non-suspended

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
          console.log("[ANKI IMPORT] No deck mapping for Anki deck ID:", card.did, "Available:", Array.from(ankiDeckIdToSomaDeckId.keys()));
          continue;
        }

        // Parse note fields (separated by \x1f)
        const fields = note.flds.split("\x1f");

        // Decode HTML entities from Anki (e.g., &nbsp; → space, &lt; → <)
        // This ensures content displays exactly as in Anki
        let front = decodeHtmlEntities(fields[0] || "");
        let back = decodeHtmlEntities(fields[1] || "");

        // Rewrite media URLs to point to Supabase Storage
        front = rewriteMediaUrls(front, mediaUrlMap);
        back = rewriteMediaUrls(back, mediaUrlMap);

        // Debug first card to see raw data
        if (skippedEmptyFields === 0 && importedCount === 0) {
          console.log("[ANKI IMPORT] First card debug:", {
            rawFlds: note.flds,
            fldsLength: note.flds.length,
            splitResult: fields,
            frontRaw: fields[0],
            frontDecoded: front,
            backRaw: fields[1],
            backDecoded: back,
          });
        }

        if (!front.trim() || !back.trim()) {
          skippedEmptyFields++;
          continue;
        }

        // Calculate due date and state based on Anki card queue (current state)
        // CRITICAL: Use queue, not type, to get the actual current state
        // Exception: For buried cards, pass type to determine underlying state
        const state = getCardStateFromQueue(card.queue, card.type);
        const intervalDays = getIntervalDays(card.ivl, card.type);

        // CRITICAL: Use centralized date normalization function
        // This prevents "Invalid time value" errors
        const dueAt = normalizeAnkiDueDate(card, collectionCreationDate, now);

        // Debug: Show first 3 card assignments with state info
        if (importedCount < 3) {
          console.log(`[ANKI IMPORT] Card ${importedCount + 1}:`, {
            ankiDeckId: card.did,
            somaDeckId,
            ankiQueue: card.queue,
            ankiType: card.type,
            mappedState: state,
            ankiDue: card.due,
            dueAt: dueAt.toISOString(),
            isDueNow: dueAt <= now,
            intervalDays,
            ankiReps: card.reps,
          });
        }

        // Determine if card is suspended/buried based on queue
        // IMPORTANT DISTINCTION:
        // - queue = -1: SUSPENDED (permanently hidden until manually unsuspended)
        //   → Import as: suspended=true, state="suspended" (excluded from all counts)
        //
        // - queue = -2, -3: BURIED (temporarily hidden for today only in Anki)
        //   → Import as: suspended=false, state=normal (buried is temporary, irrelevant after import)
        //   → Rationale: Buried state is context-specific to the day of export in Anki.
        //     After import into Soma, cards start fresh and should not carry over
        //     temporary burial status.
        const isSuspended = card.queue === -1; // ONLY truly suspended cards

        // Calculate ease factor with validation
        // Anki stores ease as integer (2500 = 2.5), validate and normalize
        let ease = 2.5; // Default ease
        if (card.factor && typeof card.factor === "number" && card.factor > 0) {
          ease = card.factor / 1000;
          // Anki ease typically ranges from 1.3 to 5.0
          if (ease < 1.3 || ease > 5.0) {
            console.warn(`[ANKI IMPORT] Card has unusual ease factor: ${ease}, using default 2.5`);
            ease = 2.5;
          }
        }

        // Validate reps and lapses
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
          console.error(`[ANKI IMPORT] Card validation failed:`, {
            error: validationError,
            cardId: card.id,
            front: front.substring(0, 50),
            state,
            queue: card.queue,
            due: card.due,
          });
          failedInserts++;
          continue; // Skip this card
        }

        // Insert card
        const { error: cardError } = await supabase.from("cards").insert({
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
          learning_step_index: 0, // Default to 0 (NOT NULL constraint)
          suspended: isSuspended, // Only truly suspended (-1), not buried (-2, -3)
        });

        if (!cardError) {
          importedCount++;
          // Track cards per deck
          cardsPerDeck.set(somaDeckId, (cardsPerDeck.get(somaDeckId) || 0) + 1);

          // Track cards by state and suspension status
          if (isSuspended && state === "suspended") {
            // Truly suspended cards (-1)
            suspendedCount++;
          } else if (card.queue === -2 || card.queue === -3) {
            // Buried cards (imported as non-suspended with normal state)
            buriedCount++;
            // Also count in their state category
            if (state === "new" || state === "learning" || state === "review") {
              cardsByState[state]++;
            }
          } else if (state !== "suspended") {
            // Normal active cards
            cardsByState[state as "new" | "learning" | "review"]++;
          }
        } else {
          failedInserts++;
          console.error("[ANKI IMPORT] Card insert failed:", {
            error: cardError,
            front: front.substring(0, 50),
            deckId: somaDeckId,
            userId
          });
        }
      }

      // Debug: Show state distribution (after queue→state mapping)
      console.log("[ANKI IMPORT] Soma cards by state (active cards):", cardsByState);
      console.log("[ANKI IMPORT] Suspended cards (-1):", suspendedCount);
      console.log("[ANKI IMPORT] Buried cards (-2, -3) imported as active:", buriedCount);
      console.log("[ANKI IMPORT] Total imported:", importedCount, "= active", (cardsByState.new + cardsByState.learning + cardsByState.review + buriedCount), "+ suspended", suspendedCount);
      console.log("[ANKI IMPORT] NOTE: Buried cards are imported as non-suspended (burial is temporary in Anki)");

      // Debug: Show card distribution per Soma deck
      console.log("[ANKI IMPORT] Cards per Soma deck:");
      for (const [somaDeckId, count] of cardsPerDeck.entries()) {
        // Find deck name from cache
        let deckName = "unknown";
        for (const [fullPath, id] of deckCache.entries()) {
          if (id === somaDeckId) {
            deckName = fullPath;
            break;
          }
        }
        console.log(`  - Deck "${deckName}" (${somaDeckId}): ${count} cards`);
      }

      // Debug: Show card distribution by Anki deck (for comparison with Anki UI)
      console.log("[ANKI IMPORT] Cards per Anki deck (original distribution):");
      const cardsByAnkiDeck = new Map<number, number>();
      for (const card of cards) {
        if (card.did !== 1) { // Skip default deck
          cardsByAnkiDeck.set(card.did, (cardsByAnkiDeck.get(card.did) || 0) + 1);
        }
      }
      for (const [ankiDeckId, count] of cardsByAnkiDeck.entries()) {
        const deckData = decksJson[ankiDeckId];
        const deckName = deckData ? (deckData as any).name : 'unknown';
        const somaDeckId = ankiDeckIdToSomaDeckId.get(ankiDeckId);
        console.log(`  - Anki deck #${ankiDeckId} "${deckName}": ${count} cards → Soma deck ${somaDeckId || 'UNMAPPED'}`);
      }

      console.log("[ANKI IMPORT] Import summary:", {
        total: cards.length,
        imported: importedCount,
        skippedNoNote,
        skippedNoDeck,
        skippedDefaultDeck,
        skippedEmptyFields,
        failedInserts
      });

      // CRITICAL: Check if too many cards failed
      // If more than 10% of cards failed, something is seriously wrong
      const totalProcessed = cards.length - skippedDefaultDeck;
      const failureRate = totalProcessed > 0 ? failedInserts / totalProcessed : 0;

      if (failureRate > 0.1) {
        const errorMsg = `Import failed: ${failedInserts} out of ${totalProcessed} cards failed validation or insertion (${(failureRate * 100).toFixed(1)}%). This indicates a serious problem with the .apkg file or import logic.`;
        console.error("[ANKI IMPORT] CRITICAL:", errorMsg);
        throw new Error(errorMsg);
      }

      // Warn if any cards failed
      if (failedInserts > 0) {
        console.warn(`[ANKI IMPORT] WARNING: ${failedInserts} cards failed to import. Check logs above for details.`);
      }

      db.close();

      // Clean up temp file
      try {
        const fs = require("fs");
        fs.unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      return NextResponse.json({
        success: true,
        imported: importedCount,
        decks: deckCache.size,
        warnings: failedInserts > 0 ? [`${failedInserts} cards failed to import`] : undefined,
      });
    } finally {
      // Ensure database is closed
      if (db.open) {
        db.close();
      }
    }
  } catch (error) {
    console.error("❌ [ANKI IMPORT] Fatal error:", error);

    // Determine error type and provide specific message
    let errorMessage = "Import failed";
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      // Provide more helpful messages for common errors
      if (errorMessage.includes("Invalid collection creation timestamp")) {
        errorMessage = "The Anki file appears to be corrupted (invalid collection timestamp). Please try exporting it again from Anki.";
      } else if (errorMessage.includes("Invalid time value")) {
        errorMessage = "The Anki file contains invalid date values. This may be due to a corrupted export or an unsupported Anki version.";
      } else if (errorMessage.includes("Unsupported Anki format")) {
        errorMessage = "This Anki file format is not supported. Please ensure you're using Anki 2.0 or later.";
      } else if (errorMessage.includes("Failed to read collection metadata")) {
        errorMessage = "Unable to read Anki collection data. The file may be corrupted.";
      } else if (errorMessage.includes("Unauthorized")) {
        errorMessage = "Authentication failed. Please log in again.";
        statusCode = 401;
      } else if (errorMessage.includes("Server configuration error")) {
        errorMessage = "Server is not configured properly. Please contact support.";
        statusCode = 503;
      } else if (errorMessage.includes("cards failed validation")) {
        // Validation failures - use the detailed message from the error
        statusCode = 400;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: statusCode }
    );
  }
}
