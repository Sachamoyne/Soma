import { z } from "zod";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const MAX_TEXT_LENGTH = 20000;
const MAX_PDF_ANALYSIS_LENGTH = 8000;

function truncatePdfAnalysisText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_PDF_ANALYSIS_LENGTH) {
    return { text, truncated: false };
  }

  return {
    text: text.substring(0, MAX_PDF_ANALYSIS_LENGTH) + "\n\n[Texte tronqué pour analyse PDF...]",
    truncated: true,
  };
}

// User-controllable generation parameters
export type DetailLevel = "summary" | "standard" | "detailed";

export interface GenerationOptions {
  cardsCount?: number;       // If defined: generate EXACTLY this many cards (3-50)
  detailLevel?: DetailLevel; // Default: "standard"
  isPdf?: boolean;           // If true: skip corrective generation (max 2 LLM calls)
}

// ============================================================================
// ÉTAPE 2 - PIPELINE D'ANALYSE
// ============================================================================

// Concept types for analysis (strict enum)
type ConceptType = "definition" | "concept" | "relation" | "process" | "fact";

// Priority order for concept types when cardsCount < concepts count
const CONCEPT_TYPE_PRIORITY: ConceptType[] = ["definition", "relation", "concept", "process", "fact"];

// Single analyzed concept
interface AnalyzedConcept {
  id: string;
  name: string;
  type: ConceptType;
  definition: string;
}

// Content analysis result (internal only)
interface ContentAnalysis {
  concepts: AnalyzedConcept[];
}

// Schema for validating analysis output
const analysisOutputSchema = z.object({
  concepts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(["definition", "concept", "relation", "process", "fact"]),
      definition: z.string().min(1),
    })
  ).min(1),
});

/**
 * ÉTAPE 2.1 - Analyse structurée du contenu
 * Extrait les concepts clés du texte sans générer de cartes
 * @returns ContentAnalysis or null if analysis fails
 */
async function analyzeContent(text: string): Promise<ContentAnalysis | null> {
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  const systemPrompt = `Tu es un expert en extraction de concepts pédagogiques.

RÈGLE ABSOLUE : Return ONLY valid JSON. No text, no markdown, no explanation.

TÂCHE : Extraire les concepts clés du texte fourni.

FORMAT DE SORTIE STRICT :
{
  "concepts": [
    {
      "id": "c1",
      "name": "nom court du concept",
      "type": "definition" | "concept" | "relation" | "process" | "fact",
      "definition": "définition concise et précise"
    }
  ]
}

TYPES DE CONCEPTS AUTORISÉS (uniquement ceux-ci) :
- "definition" : définition d'un terme ou concept
- "concept" : idée abstraite ou notion théorique
- "relation" : lien entre deux éléments (cause/effet, comparaison, etc.)
- "process" : étape, processus, méthode, procédure
- "fact" : fait, donnée, exemple concret

RÈGLES STRICTES :
- Concepts ATOMIQUES : 1 concept = 1 idée distincte
- Noms COURTS : 3-7 mots maximum
- Définitions CONCISES : 1-2 phrases maximum
- AUCUN texte libre, paragraphe ou commentaire
- AUCUNE carte, seulement l'analyse
- IDs uniques : c1, c2, c3, etc.
- Couvrir TOUS les concepts importants du texte`;

  const userPrompt = `Analyse le texte suivant et extrait TOUS les concepts pédagogiques importants.

Texte :
${text}

Réponds UNIQUEMENT avec le JSON strict conforme au schéma.`;

  const llmStart = Date.now();
  console.log("[analyzeContent] Starting content analysis...");

  try {
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
        temperature: 0.3, // Lower temperature for more deterministic analysis
      }),
    });

    const llmDuration = Date.now() - llmStart;

    if (!response.ok) {
      console.error("[analyzeContent] LLM API error:", response.status);
      return null;
    }

    console.log("[analyzeContent] LLM call successful in ms:", llmDuration);

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error("[analyzeContent] No content in LLM response");
      return null;
    }

    // Parse JSON
    let jsonContent = rawContent.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[analyzeContent] No JSON object found");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = analysisOutputSchema.parse(parsed);

    console.log("[analyzeContent] Analysis complete:", {
      conceptsCount: validated.concepts.length,
      types: validated.concepts.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });

    return validated;
  } catch (error) {
    console.error("[analyzeContent] Analysis failed:", error);
    return null;
  }
}

/**
 * ÉTAPE 2.2 - Génération des cartes à partir de l'analyse
 * Génère les cartes en se basant sur les concepts analysés
 */
async function generateCardsFromAnalysis(
  analysis: ContentAnalysis,
  options?: GenerationOptions
): Promise<{ language: string; title: string; cards: any[]; coveredConceptIds: string[] } | null> {
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  const cardsCount = options?.cardsCount;
  const detailLevel = options?.detailLevel || "standard";

  // Determine which concepts to use based on cardsCount
  let conceptsToUse = [...analysis.concepts];

  if (cardsCount !== undefined && cardsCount < analysis.concepts.length) {
    // Prioritize concepts by type: definition > relation > concept > process > fact
    conceptsToUse = conceptsToUse.sort((a, b) => {
      const priorityA = CONCEPT_TYPE_PRIORITY.indexOf(a.type);
      const priorityB = CONCEPT_TYPE_PRIORITY.indexOf(b.type);
      return priorityA - priorityB;
    }).slice(0, cardsCount);

    console.log(`[generateCardsFromAnalysis] Prioritized ${cardsCount} concepts out of ${analysis.concepts.length}`);
  }

  // Build card count instruction
  let cardCountInstruction: string;
  let targetCardsCount: number;

  if (cardsCount !== undefined) {
    cardCountInstruction = `Génère EXACTEMENT ${cardsCount} cartes.`;
    targetCardsCount = cardsCount;
  } else {
    // Default: at least 1 card per concept, max 10
    targetCardsCount = Math.min(Math.max(conceptsToUse.length, 6), 10);
    cardCountInstruction = `Génère entre 6 et 10 cartes.`;
  }

  // Build detail level instruction
  let detailInstruction: string;
  switch (detailLevel) {
    case "summary":
      detailInstruction = `NIVEAU DE DÉTAIL : RÉSUMÉ
- Front : question directe et courte (10-20 mots max).
- Back : réponse brève, essentielle (1-2 phrases max).`;
      break;
    case "detailed":
      detailInstruction = `NIVEAU DE DÉTAIL : DÉTAILLÉ
- Front : question précise, peut inclure du contexte.
- Back : réponse complète avec explications, exemples si pertinent (3-5 phrases).`;
      break;
    default:
      detailInstruction = `NIVEAU DE DÉTAIL : STANDARD
- Front : question claire et mémorisable.
- Back : réponse complète mais pas trop longue (2-3 phrases).`;
  }

  // Format concepts for the prompt
  const conceptsList = conceptsToUse.map(c =>
    `- [${c.id}] ${c.name} (${c.type}): ${c.definition}`
  ).join("\n");

  const systemPrompt = `Tu es un expert en création de flashcards pour la mémorisation efficace.

RÈGLE ABSOLUE : Return ONLY valid JSON. No text, no markdown, no explanation.

TÂCHE : Créer des flashcards à partir des concepts analysés ci-dessous.

CONCEPTS À COUVRIR :
${conceptsList}

RÈGLES STRICTES :
- ${cardCountInstruction}
- Chaque concept doit être couvert par AU MOINS 1 carte
- 1 carte = 1 concept (pas de fusion)
- Si plus de cartes que de concepts : raffiner les concepts complexes (sans inventer)
- Inclure le concept_id dans les tags de chaque carte

${detailInstruction}

FORMAT DE SORTIE :
{
  "language": "fr",
  "title": "titre descriptif du deck",
  "cards": [
    {
      "front": "question",
      "back": "réponse",
      "tags": ["concept_id"],
      "difficulty": 1-5
    }
  ]
}`;

  const userPrompt = `Génère les flashcards pour les ${conceptsToUse.length} concepts listés ci-dessus.
${cardsCount !== undefined ? `Tu DOIS générer EXACTEMENT ${cardsCount} cartes.` : ""}

Réponds UNIQUEMENT avec le JSON strict.`;

  const llmStart = Date.now();
  console.log("[generateCardsFromAnalysis] Generating cards from analysis...", {
    conceptsCount: conceptsToUse.length,
    targetCardsCount,
    detailLevel,
  });

  try {
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

    const llmDuration = Date.now() - llmStart;

    if (!response.ok) {
      console.error("[generateCardsFromAnalysis] LLM API error:", response.status);
      return null;
    }

    console.log("[generateCardsFromAnalysis] LLM call successful in ms:", llmDuration);

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error("[generateCardsFromAnalysis] No content in LLM response");
      return null;
    }

    // Parse JSON
    let jsonContent = rawContent.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[generateCardsFromAnalysis] No JSON object found");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate cards
    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      console.error("[generateCardsFromAnalysis] No cards in response");
      return null;
    }

    // Extract covered concept IDs from tags
    const coveredConceptIds = new Set<string>();
    for (const card of parsed.cards) {
      if (card.tags && Array.isArray(card.tags)) {
        for (const tag of card.tags) {
          if (typeof tag === "string" && tag.startsWith("c")) {
            coveredConceptIds.add(tag);
          }
        }
      }
    }

    console.log("[generateCardsFromAnalysis] Cards generated:", {
      cardsCount: parsed.cards.length,
      coveredConcepts: coveredConceptIds.size,
      totalConcepts: conceptsToUse.length,
    });

    return {
      language: parsed.language || "fr",
      title: parsed.title || "Deck",
      cards: parsed.cards,
      coveredConceptIds: Array.from(coveredConceptIds),
    };
  } catch (error) {
    console.error("[generateCardsFromAnalysis] Generation failed:", error);
    return null;
  }
}

/**
 * ÉTAPE 2.3 - Génération corrective pour concepts non couverts
 * Génère des cartes supplémentaires pour les concepts manquants (max 1 appel)
 */
async function generateMissingConceptCards(
  missingConcepts: AnalyzedConcept[],
  detailLevel: DetailLevel
): Promise<any[] | null> {
  if (missingConcepts.length === 0) return [];

  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  // Build detail level instruction
  let detailInstruction: string;
  switch (detailLevel) {
    case "summary":
      detailInstruction = "Réponses brèves (1-2 phrases).";
      break;
    case "detailed":
      detailInstruction = "Réponses complètes avec explications (3-5 phrases).";
      break;
    default:
      detailInstruction = "Réponses équilibrées (2-3 phrases).";
  }

  const conceptsList = missingConcepts.map(c =>
    `- [${c.id}] ${c.name} (${c.type}): ${c.definition}`
  ).join("\n");

  const systemPrompt = `Tu es un expert en création de flashcards.

RÈGLE ABSOLUE : Return ONLY valid JSON.

TÂCHE : Créer 1 flashcard par concept listé.

CONCEPTS :
${conceptsList}

RÈGLES :
- EXACTEMENT ${missingConcepts.length} carte(s)
- 1 carte = 1 concept
- ${detailInstruction}
- Inclure concept_id dans tags

FORMAT :
{
  "cards": [
    {
      "front": "question",
      "back": "réponse",
      "tags": ["concept_id"],
      "difficulty": 3
    }
  ]
}`;

  console.log("[generateMissingConceptCards] Generating cards for missing concepts:", missingConcepts.length);

  try {
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
          { role: "user", content: "Génère les flashcards pour ces concepts manquants." },
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      console.error("[generateMissingConceptCards] LLM API error");
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) return null;

    let jsonContent = rawContent.trim();
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.cards && Array.isArray(parsed.cards)) {
      console.log("[generateMissingConceptCards] Generated", parsed.cards.length, "cards for missing concepts");
      return parsed.cards;
    }

    return null;
  } catch (error) {
    console.error("[generateMissingConceptCards] Failed:", error);
    return null;
  }
}

/**
 * Pipeline complet : Analyse → Génération → Vérification couverture
 * Utilise maximum 2 appels LLM (analyse + génération)
 * Si isPdf=true : JAMAIS de génération corrective (max 2 appels LLM garantis)
 * Fallback vers l'ancienne méthode si le pipeline échoue
 */
async function generateWithPipeline(
  text: string,
  options?: GenerationOptions
): Promise<{ language: string; title: string; cards: any[] } | null> {
  const pipelineStart = Date.now();
  const cardsCount = options?.cardsCount;
  const detailLevel = options?.detailLevel || "standard";
  const isPdf = options?.isPdf || false;
  let llmCallCount = 0;

  const originalTextLength = text.length;
  const pdfTruncation = isPdf ? truncatePdfAnalysisText(text) : { text, truncated: false };
  const analysisText = pdfTruncation.text;

  console.log("[generateWithPipeline] START", {
    isPdf,
    textLength: text.length,
    cardsCount,
    detailLevel,
  });

  if (isPdf) {
    console.log("[generateWithPipeline] PDF analysis text size:", {
      originalLength: originalTextLength,
      analysisLength: analysisText.length,
      truncated: pdfTruncation.truncated,
    });
  }

  // ÉTAPE 2.1 - Analyse du contenu
  const analysis = await analyzeContent(analysisText);
  llmCallCount++;

  if (!analysis || analysis.concepts.length === 0) {
    console.log("[generateWithPipeline] Analysis failed or empty, falling back to direct generation", {
      llmCallCount,
      durationMs: Date.now() - pipelineStart,
    });
    return null; // Will trigger fallback
  }

  console.log("[generateWithPipeline] Analysis successful:", {
    conceptsDetected: analysis.concepts.length,
    llmCallCount,
  });

  // ÉTAPE 2.2 - Génération des cartes à partir de l'analyse
  const generationResult = await generateCardsFromAnalysis(analysis, options);
  llmCallCount++;

  if (!generationResult || generationResult.cards.length === 0) {
    console.log("[generateWithPipeline] Card generation failed, falling back to direct generation", {
      llmCallCount,
      durationMs: Date.now() - pipelineStart,
    });
    return null; // Will trigger fallback
  }

  if (isPdf) {
    const pipelineDuration = Date.now() - pipelineStart;
    console.log("[generateWithPipeline] PDF pipeline complete:", {
      originalTextLength,
      analysisTextLength: analysisText.length,
      cardsGenerated: generationResult.cards.length,
      llmCallCount,
      pipelineDurationMs: pipelineDuration,
    });

    return {
      language: generationResult.language,
      title: generationResult.title,
      cards: generationResult.cards,
    };
  }

  // ÉTAPE 2.3 - Vérification de couverture (simple)
  const coveredIds = new Set(generationResult.coveredConceptIds);
  const missingConcepts = analysis.concepts.filter(c => !coveredIds.has(c.id));

  console.log("[generateWithPipeline] Coverage check:", {
    totalConcepts: analysis.concepts.length,
    coveredConcepts: coveredIds.size,
    missingConcepts: missingConcepts.length,
  });

  // PDF: JAMAIS de génération corrective (optimisation performance)
  // cardsCount défini: on ne fait pas de génération corrective
  // (le nombre de cartes est plus important que la couverture complète)
  if (isPdf || cardsCount !== undefined) {
    if (cardsCount !== undefined && generationResult.cards.length !== cardsCount) {
      console.warn(`[generateWithPipeline] Card count mismatch: expected ${cardsCount}, got ${generationResult.cards.length}`);
      // On continue quand même, la vérification post-génération dans generateCardsPreview gèrera ça
    }

    const pipelineDuration = Date.now() - pipelineStart;
    console.log("[generateWithPipeline] Pipeline complete (skipping coverage correction):", {
      reason: isPdf ? "PDF source" : "cardsCount specified",
      conceptsDetected: analysis.concepts.length,
      cardsGenerated: generationResult.cards.length,
      llmCallCount,
      pipelineDurationMs: pipelineDuration,
    });

    return {
      language: generationResult.language,
      title: generationResult.title,
      cards: generationResult.cards,
    };
  }

  // Si des concepts ne sont pas couverts et qu'on a de la marge, générer des cartes supplémentaires
  // Mais seulement si on n'a pas déjà utilisé notre quota d'appels LLM
  if (missingConcepts.length > 0 && generationResult.cards.length < 10) {
    // Limiter le nombre de cartes supplémentaires
    const maxAdditional = Math.min(missingConcepts.length, 10 - generationResult.cards.length);
    const conceptsToFix = missingConcepts.slice(0, maxAdditional);

    console.log("[generateWithPipeline] Attempting to generate cards for missing concepts:", conceptsToFix.length);

    const additionalCards = await generateMissingConceptCards(conceptsToFix, detailLevel);
    llmCallCount++;

    if (additionalCards && additionalCards.length > 0) {
      generationResult.cards.push(...additionalCards);
      console.log("[generateWithPipeline] Added", additionalCards.length, "cards for missing concepts");
    }
  }

  const pipelineDuration = Date.now() - pipelineStart;
  console.log("[generateWithPipeline] Pipeline complete:", {
    conceptsDetected: analysis.concepts.length,
    cardsGenerated: generationResult.cards.length,
    llmCallCount,
    pipelineDurationMs: pipelineDuration,
  });

  return {
    language: generationResult.language,
    title: generationResult.title,
    cards: generationResult.cards,
  };
}

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
  isRetry: boolean,
  options?: GenerationOptions,
  retryContext?: { expectedCount: number; actualCount: number }
): Promise<{ language: string; title: string; cards: any[] }> {
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

  const cardsCount = options?.cardsCount;
  const detailLevel = options?.detailLevel || "standard";

  // Build card count instruction
  let cardCountInstruction: string;
  if (cardsCount !== undefined) {
    cardCountInstruction = `- Le tableau "cards" DOIT contenir EXACTEMENT ${cardsCount} éléments. NI PLUS, NI MOINS.`;
  } else {
    cardCountInstruction = `- Le tableau "cards" DOIT contenir entre 6 et 10 éléments exactement.`;
  }

  // Build detail level instruction
  let detailInstruction: string;
  switch (detailLevel) {
    case "summary":
      detailInstruction = `NIVEAU DE DÉTAIL : RÉSUMÉ
- Cartes très concises et synthétiques.
- Front : question directe et courte (10-20 mots max).
- Back : réponse brève, essentielle (1-2 phrases max).
- Focus sur les concepts clés uniquement.`;
      break;
    case "detailed":
      detailInstruction = `NIVEAU DE DÉTAIL : DÉTAILLÉ
- Cartes approfondies et exhaustives.
- Front : question précise, peut inclure du contexte.
- Back : réponse complète avec explications, exemples si pertinent (3-5 phrases).
- Couvre les nuances et détails importants.`;
      break;
    default: // "standard"
      detailInstruction = `NIVEAU DE DÉTAIL : STANDARD
- Cartes équilibrées entre concision et complétude.
- Front : question claire et mémorisable.
- Back : réponse complète mais pas trop longue (2-3 phrases).`;
  }

  // Build retry correction message if applicable
  let retryCorrection = "";
  if (isRetry && retryContext) {
    retryCorrection = `ATTENTION CRITIQUE : La tentative précédente a échoué.
Tu as généré ${retryContext.actualCount} cartes mais ${retryContext.expectedCount} étaient demandées.
Tu DOIS générer EXACTEMENT ${retryContext.expectedCount} cartes cette fois. C'est OBLIGATOIRE.
`;
  } else if (isRetry) {
    retryCorrection = "ATTENTION : Ceci est une deuxième tentative. Respecte STRICTEMENT le schéma JSON ci-dessus, sans aucun champ supplémentaire.";
  }

  const systemPrompt = `Tu es un expert en création de flashcards pour la mémorisation efficace et l'apprentissage conceptuel.

RÈGLE ABSOLUE : Return ONLY valid JSON. No text, no markdown, no explanation before or after.

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
${cardCountInstruction}
- NE JAMAIS fusionner plusieurs concepts en une seule carte.
- NE JAMAIS ajouter de commentaires, préambules ou explications hors des cartes.

${detailInstruction}

QUALITÉ DES FLASHCARDS :
- Chaque carte doit tester un concept DISTINCT et significatif.
- 1 carte = 1 information distincte, jamais plus.
- Évite les questions triviales, répétitives ou à faible valeur pédagogique.
- Privilégie la compréhension conceptuelle plutôt que la mémorisation mécanique.
- Les concepts doivent couvrir différents aspects du texte pour maximiser l'efficacité d'apprentissage.

${retryCorrection}`;

  // Build user prompt with card count
  let userPromptCardInstruction: string;
  if (cardsCount !== undefined) {
    userPromptCardInstruction = `Génère EXACTEMENT ${cardsCount} flashcards de haute qualité.`;
  } else {
    userPromptCardInstruction = `Génère entre 6 et 10 flashcards de haute qualité.`;
  }

  const userPrompt = `Extrait le texte suivant et ${userPromptCardInstruction}
Chaque flashcard doit tester un concept distinct et significatif.

Texte :
${text}

Réponds UNIQUEMENT avec le JSON strict conforme au schéma, sans aucun texte supplémentaire.`;

  const llmStart = Date.now();
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

  const llmDuration = Date.now() - llmStart;

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[LLM] API error", {
      status: response.status,
      durationMs: llmDuration,
    });
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  console.log("[LLM] Call successful in ms:", llmDuration);

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error("No content in LLM response");
  }

  // LOG RAW OUTPUT BEFORE PARSING
  console.error("[LLM] RAW_LLM_OUTPUT:", rawContent.substring(0, 500)); // Log first 500 chars for debugging

  // Extract JSON defensively - find first valid JSON object
  let jsonContent = rawContent.trim();
  
  // Remove markdown code blocks if present
  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  // Extract first JSON object if wrapped in text
  const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonContent = jsonMatch[0];
  } else {
    throw new Error(`No JSON object found in LLM output. Raw output: ${rawContent.substring(0, 200)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    console.error("[LLM] JSON parse error:", e);
    console.error("[LLM] Extracted JSON content:", jsonContent.substring(0, 500));
    throw new Error(`Failed to parse LLM JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Determine min/max cards based on options
  const minCards = cardsCount !== undefined ? cardsCount : 6;
  const maxCards = cardsCount !== undefined ? cardsCount : 10;

  // Validate schema - but be more forgiving for cards array
  let validated;
  try {
    // Build dynamic schema based on cardsCount
    const dynamicOutputSchema = z
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
          .min(minCards)
          .max(maxCards),
      })
      .strict();

    validated = dynamicOutputSchema.parse(parsed);
  } catch (schemaError) {
    // If schema validation fails, try to extract valid cards
    console.error("[LLM] Schema validation failed:", schemaError);
    console.error("[LLM] Parsed object keys:", Object.keys(parsed));

    // Attempt to extract valid cards from parsed object
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.cards)) {
      const validCards = parsed.cards.filter((card: any) => {
        return (
          card &&
          typeof card === "object" &&
          typeof card.front === "string" &&
          card.front.trim().length > 0 &&
          typeof card.back === "string" &&
          card.back.trim().length > 0
        );
      });

      const requiredMinCards = cardsCount !== undefined ? cardsCount : 6;
      if (validCards.length >= requiredMinCards) {
        // If we have enough valid cards, use them
        console.warn(`[LLM] Using ${validCards.length} valid cards out of ${parsed.cards.length} after schema validation failure`);
        validated = {
          language: parsed.language || "fr",
          title: parsed.title || "Deck",
          cards: cardsCount !== undefined
            ? validCards.slice(0, cardsCount)  // Exact count if specified
            : validCards.slice(0, 10),          // Max 10 cards otherwise
        };

        // Re-validate with relaxed schema (no strict mode)
        const relaxedSchema = z.object({
          language: z.enum(["fr", "en"]).default("fr"),
          title: z.string().min(1).default("Deck"),
          cards: z.array(
            z.object({
              front: z.string().min(1),
              back: z.string().min(1),
              tags: z.array(z.string()).optional(),
              difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
            })
          ).min(minCards).max(maxCards),
        });

        validated = relaxedSchema.parse(validated);
      } else {
        throw new Error(`Only ${validCards.length} valid cards found (minimum ${requiredMinCards} required). Schema error: ${schemaError}`);
      }
    } else {
      throw new Error(`Invalid LLM output structure. Expected object with 'cards' array. Schema error: ${schemaError}`);
    }
  }

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

  const plan: "starter" | "pro" | "free" =
    userProfile.plan === "starter" || userProfile.plan === "pro"
      ? userProfile.plan
      : "free";
  const role = userProfile.role || "user";
  const used = userProfile.ai_cards_used_current_month || 0;
  const limit = userProfile.ai_cards_monthly_limit || 0;
  const planMonthlyLimits: Record<"starter" | "pro", number> = {
    starter: 300,
    pro: 1000,
  };
  const targetLimit =
    plan === "starter" || plan === "pro" ? planMonthlyLimits[plan] : 0;
  const shouldUpdateLimit =
    (plan === "starter" || plan === "pro") && limit < targetLimit;

  const isPremium = plan === "starter" || plan === "pro";
  const isFounderOrAdmin = role === "founder" || role === "admin";
  const hasAIAccess = isPremium || isFounderOrAdmin;

  if (shouldUpdateLimit && !isFounderOrAdmin) {
    const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        ai_cards_monthly_limit: targetLimit,
        ai_quota_reset_at: userProfile.ai_quota_reset_at || nextMonth.toISOString(),
      })
      .eq("id", userId);

    if (!updateError) {
      userProfile.ai_cards_monthly_limit = targetLimit;
      userProfile.ai_quota_reset_at =
        userProfile.ai_quota_reset_at || nextMonth.toISOString();
    }
  }

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
              ? "You've reached your monthly limit of 300 AI cards. Upgrade to Pro for 1,000 cards/month."
              : "You've reached your monthly limit of 1,000 AI cards. Your quota will reset at the beginning of next month.",
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
 *
 * @param options.cardsCount - If defined, generate EXACTLY this many cards (3-50)
 * @param options.detailLevel - "summary" | "standard" | "detailed" (default: "standard")
 */
export async function generateCardsPreview(
  text: string,
  deckId: string,
  userId: string,
  options?: GenerationOptions
): Promise<GeneratePreviewResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "OPENAI_API_KEY missing",
      status: 500,
    };
  }

  // Validate options
  const cardsCount = options?.cardsCount;
  const detailLevel = options?.detailLevel || "standard";

  // Validate cardsCount if provided
  if (cardsCount !== undefined) {
    if (!Number.isInteger(cardsCount) || cardsCount < 3 || cardsCount > 50) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "cardsCount must be an integer between 3 and 50",
        status: 400,
      };
    }
  }

  // Validate detailLevel
  if (!["summary", "standard", "detailed"].includes(detailLevel)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "detailLevel must be 'summary', 'standard', or 'detailed'",
      status: 400,
    };
  }

  // Check quota (use cardsCount if specified, otherwise estimate 10 cards)
  const estimatedCards = cardsCount !== undefined ? cardsCount : 10;
  const quotaCheck = await checkUserQuota(userId, estimatedCards);
  if (!quotaCheck.canGenerate) {
    return quotaCheck.error!;
  }

  // Truncate text if needed
  const truncatedText =
    text.length > MAX_TEXT_LENGTH
      ? text.substring(0, MAX_TEXT_LENGTH) + "\n\n[Texte tronqué...]"
      : text;

  // ============================================================================
  // ÉTAPE 2 - PIPELINE D'ANALYSE (avec fallback)
  // ============================================================================
  let result;
  let usedPipeline = false;

  // Try the analysis pipeline first
  console.log("[generateCardsPreview] Attempting pipeline generation...");
  const pipelineResult = await generateWithPipeline(truncatedText, options);

  if (pipelineResult && pipelineResult.cards && pipelineResult.cards.length > 0) {
    // Pipeline succeeded
    result = pipelineResult;
    usedPipeline = true;
    console.log("[generateCardsPreview] Pipeline succeeded:", {
      cardsCount: result.cards.length,
      usedPipeline: true,
    });
  } else {
    if (options?.isPdf) {
      console.log("[generateCardsPreview] PDF pipeline failed; skipping fallback to preserve 2-call limit.");
      return {
        success: false,
        error: "INTERNAL_ERROR",
        message: "PDF pipeline failed. Please try again.",
        status: 500,
      };
    }

    // Pipeline failed, fallback to direct generation
    console.log("[generateCardsPreview] Pipeline failed, falling back to direct generation...");

    let lastError: Error | null = null;

    try {
      result = await callLLM(truncatedText, false, options);
    } catch (error) {
      console.error("[generateCardsPreview] First LLM call failed:", error);
      lastError = error instanceof Error ? error : new Error(String(error));

      try {
        result = await callLLM(truncatedText, true, options);
      } catch (retryError) {
        console.error("[generateCardsPreview] Retry LLM call also failed:", retryError);
        const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);

        return {
          success: false,
          error: "INTERNAL_ERROR",
          message: `LLM output invalid – see logs. First error: ${lastError.message}. Retry error: ${retryErrorMessage}`,
          status: 500,
        };
      }
    }

    console.log("[generateCardsPreview] Fallback generation succeeded:", {
      cardsCount: result.cards?.length || 0,
      usedPipeline: false,
    });
  }

  if (!result.cards || result.cards.length === 0) {
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Generated cards array is empty",
      status: 500,
    };
  }

  console.log("[ai-cards] Generation complete:", {
    cardsCount: result.cards.length,
    usedPipeline,
  });

  // Post-generation verification: check card count matches requested count
  if (cardsCount !== undefined && result.cards.length !== cardsCount) {
    console.warn(`[ai-cards] Card count mismatch: expected ${cardsCount}, got ${result.cards.length}. Attempting retry with correction.`);

    // Retry with corrective context
    try {
      const retryResult = await callLLM(truncatedText, true, options, {
        expectedCount: cardsCount,
        actualCount: result.cards.length,
      });

      if (retryResult.cards.length === cardsCount) {
        console.log(`[ai-cards] Retry successful, got exactly ${cardsCount} cards`);
        result = retryResult;
      } else {
        // Retry also failed to match count - return controlled error
        console.error(`[ai-cards] Retry also failed: expected ${cardsCount}, got ${retryResult.cards.length}`);
        return {
          success: false,
          error: "CARD_COUNT_MISMATCH",
          message: `L'IA n'a pas pu générer exactement ${cardsCount} cartes. Vous avez demandé ${cardsCount} cartes mais ${retryResult.cards.length} ont été générées. Veuillez réessayer ou ajuster le nombre demandé.`,
          status: 422,
        };
      }
    } catch (retryError) {
      console.error("[ai-cards] Retry for card count correction failed:", retryError);
      // Return controlled error instead of failing silently
      return {
        success: false,
        error: "CARD_COUNT_MISMATCH",
        message: `L'IA n'a pas pu générer exactement ${cardsCount} cartes. ${result.cards.length} ont été générées au lieu de ${cardsCount}. Veuillez réessayer.`,
        status: 422,
      };
    }
  }

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

export interface ConfirmCardsInput {
  deckId: string;
  userId: string;
  cards: CardPreview[];
}

export interface ConfirmCardsResult {
  success: true;
  deckId: string;
  imported: number;
  cards: CardPreview[];
}

export type ConfirmCardsResponse = ConfirmCardsResult | GenerateCardsError;

/**
 * Confirm and insert selected cards into the database.
 * This is called after user reviews and selects cards to keep.
 */
export async function confirmAndInsertCards(
  input: ConfirmCardsInput
): Promise<ConfirmCardsResponse> {
  const { deckId, userId, cards } = input;

  console.log("[confirmAndInsertCards] START", {
    deckId,
    userId,
    cardsCount: cards?.length,
  });

  if (!cards || cards.length === 0) {
    console.log("[confirmAndInsertCards] NO_CARDS - early return");
    return {
      success: false,
      error: "NO_CARDS",
      message: "No cards to insert",
      status: 400,
    };
  }

  const adminSupabase = getAdminSupabase();
  if (!adminSupabase) {
    console.log("[confirmAndInsertCards] No admin Supabase client");
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Supabase service key configuration is missing",
      status: 500,
    };
  }

  // Re-check quota with actual card count
  console.log("[confirmAndInsertCards] Checking quota...");
  const quotaCheck = await checkUserQuota(userId, cards.length);
  if (!quotaCheck.canGenerate) {
    console.log("[confirmAndInsertCards] Quota check failed:", quotaCheck.error);
    return quotaCheck.error!;
  }
  console.log("[confirmAndInsertCards] Quota OK");

  // Verify deck exists and belongs to user
  console.log("[confirmAndInsertCards] Verifying deck...");
  const { data: deck, error: deckError } = await adminSupabase
    .from("decks")
    .select("id, user_id")
    .eq("id", deckId)
    .single();

  if (deckError || !deck) {
    console.log("[confirmAndInsertCards] Deck not found:", deckError);
    return {
      success: false,
      error: "DECK_NOT_FOUND",
      message: "Deck non trouvé",
      status: 404,
    };
  }

  if (deck.user_id !== userId) {
    console.log("[confirmAndInsertCards] Deck user_id mismatch:", {
      deckUserId: deck.user_id,
      requestUserId: userId,
    });
    return {
      success: false,
      error: "FORBIDDEN",
      message: "Ce deck ne vous appartient pas",
      status: 403,
    };
  }
  console.log("[confirmAndInsertCards] Deck verified OK");

  // Prepare cards for insert
  const nowIso = new Date().toISOString();
  const cardsToInsert = cards.map((card) => ({
    user_id: userId,
    deck_id: deckId,
    front: card.front,
    back: card.back,
    type: "basic" as const,
    state: "new" as const,
    due_at: nowIso,
  }));

  console.log("[confirmAndInsertCards] Inserting cards:", {
    count: cardsToInsert.length,
    sample: cardsToInsert[0],
  });

  // Insert cards
  const { data: insertedCards, error: insertError } = await adminSupabase
    .from("cards")
    .insert(cardsToInsert)
    .select("id, front, back");

  if (insertError) {
    console.error("[confirmAndInsertCards] Insert FAILED:", insertError);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to insert cards into database",
      status: 500,
    };
  }

  console.log("[confirmAndInsertCards] Insert SUCCESS:", {
    insertedCount: insertedCards?.length ?? 0,
    insertedIds: insertedCards?.map(c => c.id),
  });

  // Increment quota ONLY after successful insertion
  if (!quotaCheck.isFounderOrAdmin && quotaCheck.profile) {
    const actualCardCount = insertedCards?.length || 0;
    await adminSupabase
      .from("profiles")
      .update({
        ai_cards_used_current_month:
          (quotaCheck.profile.ai_cards_used_current_month || 0) + actualCardCount,
      })
      .eq("id", userId);
  }

  return {
    success: true,
    deckId,
    imported: insertedCards?.length || 0,
    cards,
  };
}
