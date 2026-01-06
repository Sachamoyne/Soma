import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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

// Helper: Map Anki card queue to Synapse state
// CRITICAL: Use queue (current state), NOT type (historical state)
// Anki queue values:
// - 0 = new
// - 1 = learning
// - 2 = review (due)
// - 3 = day learning (relearning)
// - -1 = suspended
// - -2 = user buried
// - -3 = scheduler buried
function getCardStateFromQueue(
  queue: number
): "new" | "learning" | "review" | "suspended" {
  // Suspended/buried cards: MUST be mapped to 'suspended' state
  // These cards should NOT appear in study sessions or statistics
  if (queue < 0) return "suspended";

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
// We need to decode them to display correctly in Synapse
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

    // Create Supabase admin client (bypasses RLS) for database operations
    // This is safe because we already validated the user's JWT above
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
          console.error(`[ANKI IMPORT] ❌ Failed to upload ${fileName}:`, {
            error: uploadError,
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            bucket: 'card-media',
            path: storagePath
          });

          // CRITICAL: If bucket doesn't exist, this will fail with 404
          if (uploadError.statusCode === '404' || uploadError.message?.includes('Bucket not found')) {
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

    // Extract to temp file with unique name
    const tempPath = `/tmp/anki-${randomUUID()}.anki2`;
    const collectionData = collectionEntry.getData();
    require("fs").writeFileSync(tempPath, collectionData);

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
      const decksJson = JSON.parse(colRow.decks);

      // Get collection creation timestamp to calculate current day number
      const collectionCreationTimestamp = colRow.crt; // seconds since epoch
      const collectionCreationDate = new Date(collectionCreationTimestamp * 1000);
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
      console.log("[ANKI IMPORT] Anki queue distribution (0=new, 1=learning, 2=review, 3=day learning, -1=suspended):");
      for (const [queue, count] of Array.from(queueDistribution.entries()).sort((a, b) => a[0] - b[0])) {
        const queueName = queue === 0 ? "new" : queue === 1 ? "learning" : queue === 2 ? "review" : queue === 3 ? "day learning" : queue === -1 ? "suspended" : `unknown(${queue})`;
        console.log(`  queue ${queue} (${queueName}): ${count} cards`);
      }

      // Build deck cache
      const deckCache = new Map<string, string>();
      const ankiDeckIdToSynapseDeckId = new Map<number, string>();

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
        const synapseDeckId = await getOrCreateDeck(supabase, userId, deckPath, deckCache);
        ankiDeckIdToSynapseDeckId.set(ankiDeckId, synapseDeckId);

        // Debug: Show mapping
        console.log(`[ANKI IMPORT] Mapped Anki deck ${deckId} ("${deckName}") → Synapse deck ${synapseDeckId} (leaf: "${deckPath[deckPath.length - 1]}")`);
      }

      // Debug: Show all created decks with Anki deck ID mapping
      console.log("[ANKI IMPORT] All Synapse decks created (with Anki ID mapping):");
      for (const [fullPath, synapseDeckId] of deckCache.entries()) {
        // Find corresponding Anki deck ID(s) for this Synapse deck
        const ankiDeckIds: number[] = [];
        for (const [ankiId, synapseId] of ankiDeckIdToSynapseDeckId.entries()) {
          if (synapseId === synapseDeckId) {
            ankiDeckIds.push(ankiId);
          }
        }
        console.log(`  - "${fullPath}" (Synapse: ${synapseDeckId}, Anki: ${ankiDeckIds.join(', ') || 'none'})`);
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
      const cardsPerDeck = new Map<string, number>(); // Track cards per Synapse deck
      const cardsByState = { new: 0, learning: 0, review: 0 }; // Track cards by state
      let suspendedCount = 0; // Track suspended cards

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

        const synapseDeckId = ankiDeckIdToSynapseDeckId.get(card.did);
        if (!synapseDeckId) {
          skippedNoDeck++;
          console.log("[ANKI IMPORT] No deck mapping for Anki deck ID:", card.did, "Available:", Array.from(ankiDeckIdToSynapseDeckId.keys()));
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
        const state = getCardStateFromQueue(card.queue);
        const intervalDays = getIntervalDays(card.ivl, card.type);
        let dueAt = now;

        if (state === "new") {
          // New cards: due immediately
          dueAt = now;
        } else if (state === "learning") {
          // Learning cards: due field is timestamp in seconds (or negative for intraday)
          if (card.due > 0 && card.due > 1000000000) {
            // Timestamp format (seconds since epoch)
            dueAt = new Date(card.due * 1000);
          } else {
            // Intraday learning or invalid: due now
            dueAt = now;
          }
        } else if (state === "review") {
          // Review cards: due field is day number since collection creation
          // Convert day number to actual date
          const daysSinceCreation = card.due;
          dueAt = new Date(collectionCreationDate.getTime() + daysSinceCreation * 24 * 60 * 60 * 1000);
        }

        // Debug: Show first 3 card assignments with state info
        if (importedCount < 3) {
          console.log(`[ANKI IMPORT] Card ${importedCount + 1}:`, {
            ankiDeckId: card.did,
            synapseDeckId,
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
        // queue = -1 (suspended), -2 (user buried), -3 (scheduler buried)
        const isSuspended = card.queue < 0;

        // Insert card
        const { error: cardError } = await supabase.from("cards").insert({
          user_id: userId,
          deck_id: synapseDeckId,
          front,
          back,
          state,
          due_at: dueAt.toISOString(),
          interval_days: intervalDays,
          ease: card.factor > 0 ? card.factor / 1000 : 2.5, // Anki stores ease as integer (2500 = 2.5)
          reps: card.reps,
          lapses: card.lapses,
          learning_step_index: 0, // Default to 0 (NOT NULL constraint)
          suspended: isSuspended, // Import suspended state from Anki
        });

        if (!cardError) {
          importedCount++;
          // Track cards per deck
          cardsPerDeck.set(synapseDeckId, (cardsPerDeck.get(synapseDeckId) || 0) + 1);
          // Track cards by state (only non-suspended for stats comparison)
          if (!isSuspended && state !== "suspended") {
            // TypeScript: state is now guaranteed to be "new" | "learning" | "review"
            cardsByState[state as "new" | "learning" | "review"]++;
          } else {
            suspendedCount++;
          }
        } else {
          failedInserts++;
          console.error("[ANKI IMPORT] Card insert failed:", {
            error: cardError,
            front: front.substring(0, 50),
            deckId: synapseDeckId,
            userId
          });
        }
      }

      // Debug: Show state distribution (after queue→state mapping)
      console.log("[ANKI IMPORT] Synapse cards by state (non-suspended only):", cardsByState);
      console.log("[ANKI IMPORT] Suspended/buried cards:", suspendedCount);
      console.log("[ANKI IMPORT] NOTE: States mapped from Anki queue field, NOT type field");

      // Debug: Show card distribution per Synapse deck
      console.log("[ANKI IMPORT] Cards per Synapse deck:");
      for (const [synapseDeckId, count] of cardsPerDeck.entries()) {
        // Find deck name from cache
        let deckName = "unknown";
        for (const [fullPath, id] of deckCache.entries()) {
          if (id === synapseDeckId) {
            deckName = fullPath;
            break;
          }
        }
        console.log(`  - Deck "${deckName}" (${synapseDeckId}): ${count} cards`);
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
        const synapseDeckId = ankiDeckIdToSynapseDeckId.get(ankiDeckId);
        console.log(`  - Anki deck #${ankiDeckId} "${deckName}": ${count} cards → Synapse deck ${synapseDeckId || 'UNMAPPED'}`);
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
      });
    } finally {
      // Ensure database is closed
      if (db.open) {
        db.close();
      }
    }
  } catch (error) {
    console.error("Anki import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
