/**
 * Prompts centralisés pour la génération de cartes AI.
 */

import { DEFAULT_PROMPTS } from "./default";
import { PREPA_MATHS_PROMPTS } from "./prepa-maths";

export type StudyMode = "general" | "prepa";
export type SubjectMode = "general" | "maths";

export interface PromptSet {
  /** Prompt pour l'analyse de contenu (extraction des concepts) */
  analyzeContent: string;
  /** Prompt pour la génération de cartes à partir des concepts */
  generateFromAnalysis: (conceptsList: string, cardCountInstruction: string, detailInstruction: string) => string;
  /** Prompt fallback pour la génération directe */
  fallback: (cardCountInstruction: string, detailInstruction: string, retryCorrection: string) => string;
}

/**
 * Retourne le jeu de prompts approprié selon le mode d'étude et la matière
 */
export function getPromptsForMode(studyMode?: StudyMode, subjectMode?: SubjectMode): PromptSet {
  const mode = studyMode || "general";
  const subject = subjectMode || "general";

  if (mode === "prepa" && subject === "maths") {
    return PREPA_MATHS_PROMPTS;
  }

  return DEFAULT_PROMPTS;
}

/**
 * Alias rétrocompatible.
 */
export function getPrompts(studyMode?: StudyMode, subjectMode?: SubjectMode): PromptSet {
  return getPromptsForMode(studyMode, subjectMode);
}
