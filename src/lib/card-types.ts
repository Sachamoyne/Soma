/**
 * Card Type System
 *
 * Defines the different types of flashcards supported by the system.
 * Each card type has different behavior during study sessions.
 */

// Classic mode card types
export type ClassicCardType = "basic" | "reversible" | "typed";

// Math mode card types (semantic types, behave like "basic" during review)
export type MathCardType = "definition" | "property" | "formula";

// Languages mode card types (semantic types, behave like "basic" during review)
export type LanguagesCardType = "vocabulary" | "grammar_rule";

// Union of all card types
export type CardType = ClassicCardType | MathCardType | LanguagesCardType;

export interface CardTypeInfo {
  id: CardType;
  label: string;
  description: string;
  /** Optional translation key for label */
  labelKey?: string;
  /** Optional translation key for description */
  descKey?: string;
}

/**
 * Classic mode card types:
 * - basic: Standard flashcard (front → back, press to reveal)
 * - reversible: Can appear as front→back OR back→front randomly
 * - typed: User must type the answer to proceed
 */
export const CLASSIC_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "basic",
    label: "Basic",
    description: "Front → Back (press to reveal)",
    labelKey: "cardTypes.basic",
    descKey: "cardTypes.basicDesc",
  },
  {
    id: "reversible",
    label: "Reversible",
    description: "Front ⇄ Back (random direction)",
    labelKey: "cardTypes.reversible",
    descKey: "cardTypes.reversibleDesc",
  },
  {
    id: "typed",
    label: "Typed Answer",
    description: "Type the answer to proceed",
    labelKey: "cardTypes.typed",
    descKey: "cardTypes.typedDesc",
  },
];

/**
 * Math mode card types (semantic types for mathematics):
 * - definition: Concept name → Definition
 * - property: Statement → Explanation or proof
 * - formula: Formula name or context → Formula (LaTeX-compatible)
 *
 * These behave like "basic" cards during review for now.
 */
export const MATH_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "definition",
    label: "Definition",
    description: "Concept → Definition",
    labelKey: "cardTypes.definition",
    descKey: "cardTypes.definitionDesc",
  },
  {
    id: "property",
    label: "Property / Theorem",
    description: "Statement → Explanation or proof",
    labelKey: "cardTypes.property",
    descKey: "cardTypes.propertyDesc",
  },
  {
    id: "formula",
    label: "Formula",
    description: "Context → Formula (LaTeX supported)",
    labelKey: "cardTypes.formula",
    descKey: "cardTypes.formulaDesc",
  },
];

/**
 * Languages mode card types (semantic types for language learning):
 * - vocabulary: Word → Translation (with optional gender, plural, notes)
 * - grammar_rule: Rule title → Explanation + example
 *
 * These behave like "basic" cards during review for now.
 */
export const LANGUAGES_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "vocabulary",
    label: "Vocabulary",
    description: "Word → Translation",
    labelKey: "cardTypes.vocabulary",
    descKey: "cardTypes.vocabularyDesc",
  },
  {
    id: "grammar_rule",
    label: "Grammar Rule",
    description: "Rule → Explanation + example",
    labelKey: "cardTypes.grammarRule",
    descKey: "cardTypes.grammarRuleDesc",
  },
];

/**
 * Legacy export for backward compatibility
 * @deprecated Use CLASSIC_CARD_TYPES or getCardTypesForMode() instead
 */
export const CARD_TYPES: CardTypeInfo[] = CLASSIC_CARD_TYPES;

/**
 * Returns the appropriate card types for a given deck mode
 */
export function getCardTypesForMode(mode: "classic" | "math" | "languages"): CardTypeInfo[] {
  switch (mode) {
    case "math":
      return MATH_CARD_TYPES;
    case "languages":
      return LANGUAGES_CARD_TYPES;
    default:
      return CLASSIC_CARD_TYPES;
  }
}

/**
 * Returns the default card type for a given deck mode
 */
export function getDefaultCardTypeForMode(mode: "classic" | "math" | "languages"): CardType {
  switch (mode) {
    case "math":
      return "definition";
    case "languages":
      return "vocabulary";
    default:
      return "basic";
  }
}

/**
 * Extended card interface that includes type and extra fields.
 * This extends the base Card type from Supabase.
 */
export interface CardWithType {
  type: CardType;
  extra?: Record<string, any> | null;
}

/** All valid card type values */
const ALL_CARD_TYPES: CardType[] = [
  "basic", "reversible", "typed",           // Classic
  "definition", "property", "formula",       // Math
  "vocabulary", "grammar_rule",              // Languages
];

/**
 * Validates if a string is a valid card type
 */
export function isValidCardType(type: string): type is CardType {
  return ALL_CARD_TYPES.includes(type as CardType);
}

/**
 * Gets the default card type for new cards
 * @deprecated Use getDefaultCardTypeForMode() instead
 */
export function getDefaultCardType(): CardType {
  return "basic";
}

/**
 * Checks if a card type is a math-specific type
 */
export function isMathCardType(type: CardType): type is MathCardType {
  return type === "definition" || type === "property" || type === "formula";
}

/**
 * Checks if a card type is a languages-specific type
 */
export function isLanguagesCardType(type: CardType): type is LanguagesCardType {
  return type === "vocabulary" || type === "grammar_rule";
}

/**
 * Normalizes answer for comparison (case-insensitive, trimmed)
 */
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

/**
 * Checks if a typed answer is correct
 * Currently uses exact match after normalization
 * Future: Could support fuzzy matching, tolerance settings from extra field
 */
export function isAnswerCorrect(
  userAnswer: string,
  correctAnswer: string
): boolean {
  return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
}

/**
 * Randomly decides orientation for reversible cards
 * Returns true for normal (front→back), false for reversed (back→front)
 */
export function getReversibleOrientation(): boolean {
  return Math.random() >= 0.5;
}
