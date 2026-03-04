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

// Humanities mode card types (semantic types for philosophy, etc.)
export type HumanitiesCardType = "philosophy_concept";

// Law mode card types (semantic types for legal studies)
export type LawCardType = "statute_article" | "case_brief" | "practical_case";

// Medicine mode card types (semantic types for medical studies)
export type MedicineCardType = "med_definition" | "med_presentation" | "med_diagnosis" | "med_treatment" | "med_clinical_case";

// Union of all card types
export type CardType = ClassicCardType | MathCardType | LanguagesCardType | HumanitiesCardType | LawCardType | MedicineCardType;

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
 * Humanities mode card types (semantic types for humanities):
 * - philosophy_concept: Concept name → Structured back with author, work, date, explanation, example
 *
 * These use the extra JSONB field for structured data.
 */
export const HUMANITIES_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "philosophy_concept",
    label: "Philosophy Concept",
    description: "Concept → Author, Work, Explanation, Example",
    labelKey: "cardTypes.philosophyConcept",
    descKey: "cardTypes.philosophyConceptDesc",
  },
];

/**
 * Law mode card types (semantic types for legal studies):
 * - statute_article: Article reference → Structured article content
 * - case_brief: Case identifier → Faits / Procédure / Problème / Solution / Portée
 * - practical_case: Practical question → Qualification / Règles / Application / Conclusion
 *
 * These use the extra JSONB field for structured data.
 */
export const LAW_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "statute_article",
    label: "Article de loi",
    description: "Référence → Texte, conditions, pièges, exemple",
    labelKey: "cardTypes.statuteArticle",
    descKey: "cardTypes.statuteArticleDesc",
  },
  {
    id: "case_brief",
    label: "Fiche d'arrêt",
    description: "Arrêt → Faits, procédure, problème, solution, portée",
    labelKey: "cardTypes.caseBrief",
    descKey: "cardTypes.caseBriefDesc",
  },
  {
    id: "practical_case",
    label: "Cas pratique",
    description: "Question → Qualification, règles, application, conclusion",
    labelKey: "cardTypes.practicalCase",
    descKey: "cardTypes.practicalCaseDesc",
  },
];

/**
 * Medicine mode card types (semantic types for medical studies):
 * - med_definition: Term → Definition + key elements
 * - med_presentation: Disease → Clinical presentation (symptoms/signs)
 * - med_diagnosis: Clinical presentation → Possible diagnoses
 * - med_treatment: Disease → Treatment and management
 * - med_clinical_case: Clinical case → Diagnosis + explanation
 *
 * These use the extra JSONB field for structured data.
 */
export const MEDICINE_CARD_TYPES: CardTypeInfo[] = [
  {
    id: "med_definition",
    label: "Medical Definition",
    description: "Term → Definition + key elements",
    labelKey: "cardTypes.medDefinition",
    descKey: "cardTypes.medDefinitionDesc",
  },
  {
    id: "med_presentation",
    label: "Clinical Presentation",
    description: "Disease → Symptoms & signs",
    labelKey: "cardTypes.medPresentation",
    descKey: "cardTypes.medPresentationDesc",
  },
  {
    id: "med_diagnosis",
    label: "Diagnostic Reasoning",
    description: "Presentation → Possible diagnoses",
    labelKey: "cardTypes.medDiagnosis",
    descKey: "cardTypes.medDiagnosisDesc",
  },
  {
    id: "med_treatment",
    label: "Treatment",
    description: "Disease → Treatment & management",
    labelKey: "cardTypes.medTreatment",
    descKey: "cardTypes.medTreatmentDesc",
  },
  {
    id: "med_clinical_case",
    label: "Clinical Case",
    description: "Scenario → Diagnosis + explanation",
    labelKey: "cardTypes.medClinicalCase",
    descKey: "cardTypes.medClinicalCaseDesc",
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
export function getCardTypesForMode(mode: "classic" | "math" | "languages" | "humanities" | "law" | "medicine"): CardTypeInfo[] {
  switch (mode) {
    case "math":
      return MATH_CARD_TYPES;
    case "languages":
      return LANGUAGES_CARD_TYPES;
    case "humanities":
      return HUMANITIES_CARD_TYPES;
    case "law":
      return LAW_CARD_TYPES;
    case "medicine":
      return MEDICINE_CARD_TYPES;
    default:
      return CLASSIC_CARD_TYPES;
  }
}

/**
 * Returns the default card type for a given deck mode
 */
export function getDefaultCardTypeForMode(mode: "classic" | "math" | "languages" | "humanities" | "law" | "medicine"): CardType {
  switch (mode) {
    case "math":
      return "definition";
    case "languages":
      return "vocabulary";
    case "humanities":
      return "philosophy_concept";
    case "law":
      return "statute_article";
    case "medicine":
      return "med_definition";
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
  "basic", "reversible", "typed",                                              // Classic
  "definition", "property", "formula",                                         // Math
  "vocabulary", "grammar_rule",                                                // Languages
  "philosophy_concept",                                                        // Humanities
  "statute_article", "case_brief", "practical_case",                          // Law
  "med_definition", "med_presentation", "med_diagnosis", "med_treatment", "med_clinical_case", // Medicine
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
 * Checks if a card type is a humanities-specific type
 */
export function isHumanitiesCardType(type: CardType): type is HumanitiesCardType {
  return type === "philosophy_concept";
}

/**
 * Checks if a card type is a law-specific type
 */
export function isLawCardType(type: CardType): type is LawCardType {
  return type === "statute_article" || type === "case_brief" || type === "practical_case";
}

/**
 * Checks if a card type is a medicine-specific type
 */
export function isMedicineCardType(type: CardType): type is MedicineCardType {
  return (
    type === "med_definition" ||
    type === "med_presentation" ||
    type === "med_diagnosis" ||
    type === "med_treatment" ||
    type === "med_clinical_case"
  );
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
