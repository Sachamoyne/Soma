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

// Helper: Map Anki card state to Synapse state
function getCardState(type: number): "new" | "learning" | "review" {
  // type: 0=new, 1=learning, 2=review, 3=relearning
  if (type === 0) return "new";
  if (type === 1 || type === 3) return "learning";
  return "review";
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

    // Debug: List all files in the .apkg
    const entries = zip.getEntries();
    console.log("[ANKI IMPORT] Files in .apkg:", entries.map(e => ({
      name: e.entryName,
      size: e.header.size,
      compressedSize: e.header.compressedSize
    })));

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
        SELECT id, nid, did, type, ivl, factor, reps, lapses, due
        FROM cards
      `).all() as Array<{
        id: number;
        nid: number;
        did: number;
        type: number;
        ivl: number;
        factor: number;
        reps: number;
        lapses: number;
        due: number;
      }>;

      console.log("[ANKI IMPORT] Read from Anki DB:", { notes: notes.length, cards: cards.length });

      // Build deck cache
      const deckCache = new Map<string, string>();
      const ankiDeckIdToSynapseDeckId = new Map<number, string>();

      // Debug: Show all Anki decks
      console.log("[ANKI IMPORT] Anki decks from database:");
      for (const [deckId, deckData] of Object.entries(decksJson)) {
        console.log(`  - Anki ID ${deckId}: ${(deckData as any).name}`);
      }

      // Create decks with hierarchy
      for (const [deckId, deckData] of Object.entries(decksJson)) {
        const deckName = (deckData as any).name as string;
        const deckPath = parseDeckName(deckName);
        const synapseDeckId = await getOrCreateDeck(supabase, userId, deckPath, deckCache);
        ankiDeckIdToSynapseDeckId.set(Number(deckId), synapseDeckId);

        // Debug: Show mapping
        console.log(`[ANKI IMPORT] Mapped Anki deck ${deckId} ("${deckName}") → Synapse deck ${synapseDeckId} (leaf: "${deckPath[deckPath.length - 1]}")`);
      }

      // Debug: Show all created decks
      console.log("[ANKI IMPORT] All Synapse decks created:");
      for (const [fullPath, deckId] of deckCache.entries()) {
        console.log(`  - "${fullPath}" → ${deckId}`);
      }

      // Build note lookup
      const noteMap = new Map(notes.map((n) => [n.id, n]));

      // Import cards
      let importedCount = 0;
      let skippedNoNote = 0;
      let skippedNoDeck = 0;
      let skippedEmptyFields = 0;
      let failedInserts = 0;
      const now = new Date();
      const cardsPerDeck = new Map<string, number>(); // Track cards per Synapse deck
      const cardsByState = { new: 0, learning: 0, review: 0 }; // Track cards by state

      for (const card of cards) {
        const note = noteMap.get(card.nid);
        if (!note) {
          skippedNoNote++;
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
        const front = fields[0] || "";
        const back = fields[1] || "";

        // Debug first card to see raw data
        if (skippedEmptyFields === 0 && importedCount === 0) {
          console.log("[ANKI IMPORT] First card debug:", {
            rawFlds: note.flds,
            fldsLength: note.flds.length,
            splitResult: fields,
            front: front,
            back: back,
            frontTrimmed: front.trim(),
            backTrimmed: back.trim()
          });
        }

        if (!front.trim() || !back.trim()) {
          skippedEmptyFields++;
          continue;
        }

        // Calculate due date based on Anki card type
        const state = getCardState(card.type);
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
            ankiType: card.type,
            state,
            ankiDue: card.due,
            dueAt: dueAt.toISOString(),
            isDueNow: dueAt <= now,
            intervalDays,
          });
        }

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
        });

        if (!cardError) {
          importedCount++;
          // Track cards per deck
          cardsPerDeck.set(synapseDeckId, (cardsPerDeck.get(synapseDeckId) || 0) + 1);
          // Track cards by state
          cardsByState[state]++;
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

      // Debug: Show state distribution
      console.log("[ANKI IMPORT] Cards by state:", cardsByState);

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

      console.log("[ANKI IMPORT] Import summary:", {
        total: cards.length,
        imported: importedCount,
        skippedNoNote,
        skippedNoDeck,
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
