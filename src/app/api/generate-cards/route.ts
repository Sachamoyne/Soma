import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const requestSchema = z.object({
  text: z.string().min(1),
  deck_id: z.string().uuid(),
  language: z.enum(["fr", "en"]),
});

// Strict output schema - NO extra fields allowed
const strictOutputSchema = z
  .object({
    language: z.enum(["fr", "en"]),
    title: z.string().min(1),
    cards: z
      .array(
        z
          .object({
            front: z.string().min(1),
            back: z.string().min(1),
            tags: z.array(z.string()).optional(),
            difficulty: z.union([
              z.literal(1),
              z.literal(2),
              z.literal(3),
              z.literal(4),
              z.literal(5),
            ]).optional(),
          })
          .strict()
      )
      .min(6)
      .max(10),
  })
  .strict();

const MAX_TEXT_LENGTH = 20000;

// Helper to check for distinct concepts (simple similarity check)
function hasDistinctConcepts(cards: Array<{ front: string }>): boolean {
  const fronts = cards.map((c) => c.front.toLowerCase().trim());
  const uniqueFronts = new Set(fronts);
  // Allow some tolerance for minor variations, but reject obvious duplicates
  if (uniqueFronts.size < fronts.length * 0.8) {
    return false;
  }
  return true;
}

async function callLLM(
  text: string,
  isRetry: boolean
): Promise<{ language: string; title: string; cards: any[] }> {
    const model = process.env.LLM_MODEL || "gpt-4o-mini";
    const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  const systemPrompt = `Tu es un expert en création de flashcards pour la mémorisation efficace et l'apprentissage conceptuel.

RÈGLES STRICTES DE SORTIE JSON :
- Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans markdown, sans commentaires.
- Le JSON DOIT respecter EXACTEMENT ce schéma, sans aucun champ supplémentaire :
{
  "language": "fr" | "en",
  "title": "titre du deck",
  "cards": [
    {
      "front": "question ou concept",
      "back": "réponse ou définition",
      "tags": ["tag1", "tag2"] (optionnel),
      "difficulty": 1 | 2 | 3 | 4 | 5 (optionnel)
    }
  ]
}

INTERDICTIONS ABSOLUES :
- AUCUN champ "confidence", "metadata", "explanation", "commentary" ou autre champ non listé ci-dessus.
- AUCUN markdown, aucune explication en dehors du JSON.
- Le tableau "cards" DOIT contenir entre 6 et 10 éléments exactement.

QUALITÉ DES FLASHCARDS :
- Chaque carte doit tester un concept DISTINCT et significatif.
- Évite les questions triviales, répétitives ou à faible valeur pédagogique.
- Privilégie la compréhension conceptuelle plutôt que la mémorisation mécanique.
- Le front doit être concis et mémorisable. Le back doit être clair et complet mais pas trop long.
- Les concepts doivent couvrir différents aspects du texte pour maximiser l'efficacité d'apprentissage.

${isRetry ? "ATTENTION : Ceci est une deuxième tentative. Respecte STRICTEMENT le schéma JSON ci-dessus, sans aucun champ supplémentaire." : ""}`;

  const userPrompt = `Extrait le texte suivant et génère entre 6 et 10 flashcards de haute qualité.
Chaque flashcard doit tester un concept distinct et significatif.

Texte :
${text}

Réponds UNIQUEMENT avec le JSON strict conforme au schéma, sans aucun texte supplémentaire.`;

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
    throw new Error("No content in LLM response");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
    throw new Error(`Failed to parse LLM JSON: ${e}`);
  }

  // Strict validation - rejects any extra fields
  const validated = strictOutputSchema.parse(parsed);

  // Additional validation: check for distinct concepts
  if (!hasDistinctConcepts(validated.cards)) {
    throw new Error(
      "Cards do not test distinct concepts - too many duplicates detected"
    );
  }

  return validated;
}

export async function POST(request: NextRequest) {
  console.log("[generate-cards] Request received");

  try {
    const body = await request.json();
    console.log("[generate-cards] Body parsed, deck_id:", body.deck_id);

    const { text, deck_id, language } = requestSchema.parse(body);
    console.log("[generate-cards] Schema validated");

    // Authenticate user (normal anon client with RLS)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[generate-cards] Auth result - user:", user?.id ?? "null", "authError:", authError?.message ?? "none");

    if (authError || !user) {
      console.log("[generate-cards] Returning 401 Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify deck exists and belongs to user (still via RLS-aware client)
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("id, user_id")
      .eq("id", deck_id)
      .single();

    console.log("[generate-cards] Deck lookup - found:", !!deck, "error:", deckError?.message ?? "none");

    if (deckError || !deck) {
      console.log("[generate-cards] Returning 404 Deck not found");
      return NextResponse.json(
        { error: "Deck not found" },
        { status: 404 }
      );
    }

    if (deck.user_id !== user.id) {
      console.log("[generate-cards] Returning 403 Forbidden - deck.user_id:", deck.user_id, "user.id:", user.id);
      return NextResponse.json(
        { error: "Forbidden: deck does not belong to user" },
        { status: 403 }
      );
    }

    console.log("[generate-cards] Deck ownership verified");

    // Check AI quota before generating cards
    // Use service role client to check quota
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Supabase service key configuration is missing" },
        { status: 500 }
      );
    }

    const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get user profile to check quota
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("plan, ai_cards_used_current_month, ai_cards_monthly_limit, ai_quota_reset_at")
      .eq("user_id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is OK (we'll create profile)
      console.error("[generate-cards] Profile lookup failed:", profileError);
      return NextResponse.json(
        { error: "Failed to check quota", details: profileError.message },
        { status: 500 }
      );
    }

    // Create profile if it doesn't exist
    let userProfile = profile;
    if (!userProfile) {
      const { data: newProfile, error: createError } = await adminSupabase
        .from("profiles")
        .insert({
          user_id: user.id,
          plan: "free",
          ai_cards_used_current_month: 0,
          ai_cards_monthly_limit: 0,
          ai_quota_reset_at: new Date(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            1
          ).toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error("[generate-cards] Failed to create profile:", createError);
        return NextResponse.json(
          { error: "Failed to initialize user profile" },
          { status: 500 }
        );
      }
      userProfile = newProfile;
    }

    if (!userProfile) {
      return NextResponse.json(
        { error: "Failed to initialize user profile" },
        { status: 500 }
      );
    }

    // Check if quota needs reset (new month started)
    const resetAt = new Date(userProfile.ai_quota_reset_at);
    const now = new Date();
    if (resetAt <= now) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const { error: resetError } = await adminSupabase
        .from("profiles")
        .update({
          ai_cards_used_current_month: 0,
          ai_quota_reset_at: nextMonth.toISOString(),
        })
        .eq("user_id", user.id);

      if (resetError) {
        console.error("[generate-cards] Failed to reset quota:", resetError);
      } else {
        userProfile.ai_cards_used_current_month = 0;
        userProfile.ai_quota_reset_at = nextMonth.toISOString();
      }
    }

    // Check quota (estimate max 10 cards)
    const estimatedCardCount = 10;
    const plan = userProfile.plan || "free";
    const used = userProfile.ai_cards_used_current_month || 0;
    const limit = userProfile.ai_cards_monthly_limit || 0;

    let canGenerate = false;
    if (plan === "free") {
      canGenerate = false;
    } else if (used + estimatedCardCount <= limit) {
      canGenerate = true;
    } else {
      canGenerate = false;
    }

    console.log("[generate-cards] Quota check:", { plan, used, limit, canGenerate });

    // Check if user can generate cards
    if (!canGenerate) {
      if (plan === "free") {
        return NextResponse.json(
          {
            error: "QUOTA_FREE_PLAN",
            message: "AI flashcard generation is not available on the free plan. Please upgrade to Starter or Pro.",
            plan: plan,
          },
          { status: 403 }
        );
      } else {
        // Starter or Pro user who exceeded quota
        const remaining = Math.max(0, limit - used);
        return NextResponse.json(
          {
            error: "QUOTA_EXCEEDED",
            message:
              plan === "starter"
                ? "You've reached your monthly limit of 800 AI cards. Upgrade to Pro for 2,500 cards/month."
                : "You've reached your monthly limit of 2,500 AI cards. Your quota will reset at the beginning of next month.",
            plan: plan,
            used: used,
            limit: limit,
            remaining: remaining,
            reset_at: userProfile.ai_quota_reset_at,
          },
          { status: 403 }
        );
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing" },
        { status: 500 }
      );
    }

    const truncatedText =
      text.length > MAX_TEXT_LENGTH
        ? text.substring(0, MAX_TEXT_LENGTH) + "\n\n[Texte tronqué...]"
        : text;

    let result;
    let isRetry = false;

    try {
      result = await callLLM(truncatedText, false);
    } catch (error) {
      // First attempt failed - retry once with stricter prompt
      isRetry = true;
      try {
        result = await callLLM(truncatedText, true);
      } catch (retryError) {
        // Second attempt also failed
        return NextResponse.json(
          {
            error:
              "Failed to generate valid output after retry. The LLM response did not match the required schema exactly.",
            details:
              error instanceof Error
                ? error.message
                : "Unknown validation error",
          },
          { status: 500 }
        );
      }
    }

    // Validate cards array is not empty
    if (!result.cards || result.cards.length === 0) {
      return NextResponse.json(
        { error: "Generated cards array is empty" },
        { status: 500 }
      );
    }

    console.log("[generate-cards] LLM call successful, cards count:", result.cards.length);

    // Increment quota with actual card count
    const actualCardCount = result.cards.length;
    const { error: incrementError } = await adminSupabase
      .from("profiles")
      .update({
        ai_cards_used_current_month: (userProfile.ai_cards_used_current_month || 0) + actualCardCount,
      })
      .eq("user_id", user.id);

    if (incrementError) {
      console.error("[generate-cards] Failed to increment quota:", incrementError);
      // Don't fail the request, but log the error
    }

    // Prepare cards for bulk insert
    const cardsToInsert = result.cards.map((card) => {
      const extra: Record<string, unknown> = {
        source: "ai",
      };
      if (card.tags && card.tags.length > 0) {
        extra.tags = card.tags;
      }
      if (card.difficulty !== undefined) {
        extra.difficulty = card.difficulty;
      }

      return {
        user_id: user.id,
        deck_id,
        front: card.front,
        back: card.back,
        type: "basic" as const,
        state: "new" as const,
      };
    });

    // Bulk insert cards
    // adminSupabase is already created above for quota check
    console.log("[generate-cards] Inserting", cardsToInsert.length, "cards into database");

    const { data: insertedCards, error: insertError } = await adminSupabase
      .from("cards")
      .insert(cardsToInsert)
      .select("id, front, back");

    if (insertError) {
      console.log("[generate-cards] Insert failed:", insertError.message, "code:", insertError.code);
      return NextResponse.json(
        {
          error: "Failed to insert cards into database",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log("[generate-cards] Insert successful, inserted:", insertedCards?.length ?? 0, "cards");

    // Prepare response with card previews
    const cardPreviews = result.cards.map((card) => {
      const preview: {
        front: string;
        back: string;
        tags?: string[];
        difficulty?: number;
      } = {
        front: card.front,
        back: card.back,
      };
      if (card.tags && card.tags.length > 0) {
        preview.tags = card.tags;
      }
      if (card.difficulty !== undefined) {
        preview.difficulty = card.difficulty;
      }
      return preview;
    });

    return NextResponse.json({
      deck_id,
      imported: insertedCards?.length || 0,
      cards: cardPreviews,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Validation error: ${error.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

