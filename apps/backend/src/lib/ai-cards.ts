import { z } from "zod";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const MAX_TEXT_LENGTH = 20000;

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
            difficulty: z
              .union([
                z.literal(1),
                z.literal(2),
                z.literal(3),
                z.literal(4),
                z.literal(5),
              ])
              .optional(),
          })
          .strict()
      )
      .min(6)
      .max(10),
  })
  .strict();

// Helper to check for distinct concepts (simple similarity check)
function hasDistinctConcepts(cards: Array<{ front: string }>): boolean {
  const fronts = cards.map((c) => c.front.toLowerCase().trim());
  const uniqueFronts = new Set(fronts);
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

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = data.choices?.[0]?.message?.content;

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

/**
 * Helper to get admin Supabase client
 */
function getAdminSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createServiceClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check user quota and access rights
 */
async function checkUserQuota(userId: string, cardCount: number = 10): Promise<{
  canGenerate: boolean;
  isFounderOrAdmin: boolean;
  error?: any;
  profile?: any;
}> {
  const adminSupabase = getAdminSupabase();
  if (!adminSupabase) {
    return {
      canGenerate: false,
      isFounderOrAdmin: false,
      error: {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Supabase service key configuration is missing",
        status: 500,
      },
    };
  }

  // Get user profile to check quota and role
  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select(
      "plan, role, ai_cards_used_current_month, ai_cards_monthly_limit, ai_quota_reset_at"
    )
    .eq("id", userId)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("[ai-cards] Profile lookup failed:", profileError);
    return {
      canGenerate: false,
      isFounderOrAdmin: false,
      error: {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to check quota",
        status: 500,
      },
    };
  }

  let userProfile = profile;
  if (!userProfile) {
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email || null;

    const { data: newProfile, error: createError } = await adminSupabase
      .from("profiles")
      .insert({
        id: userId,
        email: email || "",
        role: "user",
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
      return {
        canGenerate: false,
        isFounderOrAdmin: false,
        error: {
          success: false,
          error: "QUOTA_FREE_PLAN",
          message:
            "AI flashcard generation is not available on the free plan. Please upgrade to Starter or Pro.",
          plan: "free",
          status: 403,
        },
      };
    }
    userProfile = newProfile;
  }

  if (!userProfile) {
    return {
      canGenerate: false,
      isFounderOrAdmin: false,
      error: {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to initialize user profile",
        status: 500,
      },
    };
  }

  const plan =
    userProfile.plan === "starter" || userProfile.plan === "pro"
      ? userProfile.plan
      : "free";
  const role = userProfile.role || "user";
  const used = userProfile.ai_cards_used_current_month || 0;
  const limit = userProfile.ai_cards_monthly_limit || 0;

  const isPremium = plan === "starter" || plan === "pro";
  const isFounderOrAdmin = role === "founder" || role === "admin";
  const hasAIAccess = isPremium || isFounderOrAdmin;

  // Check if quota needs reset
  if (!isFounderOrAdmin) {
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
        .eq("id", userId);

      if (!resetError) {
        userProfile.ai_cards_used_current_month = 0;
        userProfile.ai_quota_reset_at = nextMonth.toISOString();
      }
    }
  }

  // Check access
  let canGenerate = false;
  if (!hasAIAccess) {
    canGenerate = false;
  } else if (isFounderOrAdmin) {
    canGenerate = true;
  } else if (used + cardCount <= limit) {
    canGenerate = true;
  }

  if (!canGenerate) {
    if (!hasAIAccess) {
      return {
        canGenerate: false,
        isFounderOrAdmin: false,
        error: {
          success: false,
          error: "QUOTA_FREE_PLAN",
          message:
            "AI flashcard generation is not available on the free plan. Please upgrade to Starter or Pro.",
          plan: "free",
          status: 403,
        },
      };
    } else if (!isFounderOrAdmin) {
      const remaining = Math.max(0, limit - used);
      return {
        canGenerate: false,
        isFounderOrAdmin: false,
        error: {
          success: false,
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
          status: 403,
        },
      };
    }
  }

  return { canGenerate: true, isFounderOrAdmin, profile: userProfile };
}

export interface CardPreview {
  front: string;
  back: string;
  tags?: string[];
  difficulty?: number;
}

export interface GeneratePreviewResult {
  success: true;
  deckId: string;
  cards: CardPreview[];
}

export interface GenerateCardsError {
  success: false;
  error: string;
  code?: string;
  message?: string;
  status: number;
  plan?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  reset_at?: string;
}

export type GeneratePreviewResponse = GeneratePreviewResult | GenerateCardsError;

/**
 * Generate AI flashcards from text - PREVIEW ONLY, no database insertion.
 * Cards are returned for user review before confirmation.
 */
export async function generateCardsPreview(
  text: string,
  deckId: string,
  userId: string
): Promise<GeneratePreviewResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "OPENAI_API_KEY missing",
      status: 500,
    };
  }

  // Check quota (estimated 10 cards)
  const quotaCheck = await checkUserQuota(userId, 10);
  if (!quotaCheck.canGenerate) {
    return quotaCheck.error!;
  }

  // Truncate text if needed
  const truncatedText =
    text.length > MAX_TEXT_LENGTH
      ? text.substring(0, MAX_TEXT_LENGTH) + "\n\n[Texte tronqué...]"
      : text;

  // Call LLM with retry
  let result;
  try {
    result = await callLLM(truncatedText, false);
  } catch (error) {
    try {
      result = await callLLM(truncatedText, true);
    } catch (retryError) {
      return {
        success: false,
        error: "INTERNAL_ERROR",
        message:
          "Failed to generate valid output after retry. The LLM response did not match the required schema exactly.",
        status: 500,
      };
    }
  }

  if (!result.cards || result.cards.length === 0) {
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Generated cards array is empty",
      status: 500,
    };
  }

  console.log("[ai-cards] LLM call successful, cards count:", result.cards.length);

  // Prepare preview response (NO insertion, NO quota increment)
  const cardPreviews: CardPreview[] = result.cards.map((card) => {
    const preview: CardPreview = {
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

  return {
    success: true,
    deckId,
    cards: cardPreviews,
  };
}
