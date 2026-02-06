import express, { Request, Response } from "express";

const router = express.Router();

const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

interface VocabularyEntry {
  wordSource: string;
  wordTarget: string;
  gender?: string;
  plural?: string;
  note?: string;
  example?: string;
}

/**
 * POST /languages/parse-vocabulary
 * 
 * Parse OCR text to extract vocabulary pairs using AI.
 * 
 * Request body:
 * - text: string (OCR extracted text)
 * - sourceLanguage: string (e.g., "French")
 * - targetLanguage: string (e.g., "English")
 * 
 * Response:
 * - entries: VocabularyEntry[]
 */
router.post("/parse-vocabulary", async (req: Request, res: Response) => {
  try {
    console.log("[LANGUAGES/PARSE] Request received");

    // User is already authenticated by requireAuth middleware
    const userId = (req as any).userId;

    if (!userId) {
      console.error("[LANGUAGES/PARSE] No valid user token");
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or missing authentication token",
      });
    }

    const { text, sourceLanguage, targetLanguage } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Text is required and must be a non-empty string",
      });
    }

    if (!sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "sourceLanguage and targetLanguage are required",
      });
    }

    // Truncate text if too long
    const maxTextLength = 10000;
    const truncatedText = text.slice(0, maxTextLength);

    console.log("[LANGUAGES/PARSE] Parsing vocabulary from OCR text...");
    console.log("[LANGUAGES/PARSE] Text length:", truncatedText.length);
    console.log("[LANGUAGES/PARSE] Languages:", sourceLanguage, "→", targetLanguage);

    // Build the parsing prompt
    const systemPrompt = buildVocabularyParsingPrompt(sourceLanguage, targetLanguage);

    try {
      const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: truncatedText },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        console.error("[LANGUAGES/PARSE] LLM API error:", response.status);
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error("[LANGUAGES/PARSE] Empty response from LLM");
        return res.status(500).json({
          error: "PARSING_ERROR",
          message: "Empty response from AI",
        });
      }

      // Parse the JSON response
      let parsed: { entries: VocabularyEntry[] };
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        console.error("[LANGUAGES/PARSE] Failed to parse JSON:", parseError);
        console.error("[LANGUAGES/PARSE] Raw content:", content);
        return res.status(500).json({
          error: "PARSING_ERROR",
          message: "Failed to parse AI response",
        });
      }

      // Validate and clean entries
      const entries = (parsed.entries || [])
        .filter((entry: any) => {
          return (
            entry &&
            typeof entry.wordSource === "string" &&
            typeof entry.wordTarget === "string" &&
            entry.wordSource.trim().length > 0 &&
            entry.wordTarget.trim().length > 0
          );
        })
        .map((entry: any) => ({
          wordSource: entry.wordSource.trim(),
          wordTarget: entry.wordTarget.trim(),
          gender: entry.gender?.trim() || undefined,
          plural: entry.plural?.trim() || undefined,
          note: entry.note?.trim() || undefined,
          example: entry.example?.trim() || undefined,
        }));

      console.log("[LANGUAGES/PARSE] Parsed", entries.length, "vocabulary entries");

      return res.json({ entries });
    } catch (llmError: any) {
      console.error("[LANGUAGES/PARSE] LLM error:", llmError.message);
      
      // Try fallback parsing if LLM fails
      const fallbackEntries = fallbackParseVocabulary(truncatedText);
      
      if (fallbackEntries.length > 0) {
        console.log("[LANGUAGES/PARSE] Using fallback parsing:", fallbackEntries.length, "entries");
        return res.json({ entries: fallbackEntries, usedFallback: true });
      }

      return res.status(500).json({
        error: "PARSING_ERROR",
        message: "Failed to parse vocabulary: " + llmError.message,
      });
    }
  } catch (error) {
    console.error("[LANGUAGES/PARSE] Unexpected error:", error);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to parse vocabulary",
    });
  }
});

/**
 * Build the system prompt for vocabulary parsing
 */
function buildVocabularyParsingPrompt(sourceLanguage: string, targetLanguage: string): string {
  return `You are a vocabulary extraction expert. Your task is to extract vocabulary pairs from OCR text.

INPUT: Raw OCR text from a vocabulary page (textbook, notebook, or printed list).
SOURCE LANGUAGE: ${sourceLanguage}
TARGET LANGUAGE: ${targetLanguage}

TASK: Extract all vocabulary pairs and return them as structured JSON.

DETECTION RULES:
1. Look for common vocabulary list formats:
   - "word – translation" or "word - translation"
   - "word : translation" or "word = translation"
   - Two-column layouts (source on left, target on right)
   - Numbered lists (1. word - translation)
   - Bullet points (• word - translation)

2. IGNORE:
   - Page numbers
   - Headers, titles, chapter names
   - Decorative elements
   - Instructions or explanations (unless they're examples)
   - Empty lines

3. EXTRACT OPTIONAL INFO when present:
   - Gender markers: (m), (f), (n), der/die/das, le/la, etc.
   - Plural forms: often in parentheses or after "pl:"
   - Short notes: usage hints, context
   - Example sentences

OUTPUT FORMAT (strict JSON):
{
  "entries": [
    {
      "wordSource": "the source word",
      "wordTarget": "the translation",
      "gender": "m/f/n if detected",
      "plural": "plural form if detected",
      "note": "any usage note",
      "example": "example sentence if present"
    }
  ]
}

IMPORTANT:
- Return ONLY valid JSON
- wordSource and wordTarget are REQUIRED
- Other fields are optional (omit if not detected)
- Clean up OCR artifacts (extra spaces, broken words)
- If unsure about a pair, include it anyway (user can edit)
- Preserve original word forms (don't normalize)`;
}

/**
 * Fallback parsing when LLM fails
 * Uses simple heuristics to extract vocabulary pairs
 */
function fallbackParseVocabulary(text: string): VocabularyEntry[] {
  const entries: VocabularyEntry[] = [];
  const lines = text.split(/\n/).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Try different separators
    const separators = [" – ", " - ", " : ", " = ", "\t", "  "];
    
    for (const sep of separators) {
      if (line.includes(sep)) {
        const parts = line.split(sep).map((p) => p.trim());
        if (parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0) {
          // Skip if it looks like a header or instruction
          if (parts[0].length > 50 || parts[1].length > 100) continue;
          if (/^\d+\.?\s*$/.test(parts[0])) continue; // Just a number
          
          // Clean up the source word (remove leading numbers/bullets)
          let wordSource = parts[0].replace(/^[\d\.\)\-\•\*]+\s*/, "").trim();
          let wordTarget = parts.slice(1).join(sep).trim();
          
          // Extract gender if present
          let gender: string | undefined;
          const genderMatch = wordSource.match(/\s*\((m|f|n|masc|fem|neut)\)\s*$/i) ||
                             wordTarget.match(/\s*\((m|f|n|masc|fem|neut)\)\s*$/i);
          if (genderMatch) {
            gender = genderMatch[1].charAt(0).toLowerCase();
            wordSource = wordSource.replace(genderMatch[0], "").trim();
            wordTarget = wordTarget.replace(genderMatch[0], "").trim();
          }

          if (wordSource && wordTarget) {
            entries.push({
              wordSource,
              wordTarget,
              gender,
            });
            break; // Found a match for this line
          }
        }
      }
    }
  }

  return entries;
}

export default router;
