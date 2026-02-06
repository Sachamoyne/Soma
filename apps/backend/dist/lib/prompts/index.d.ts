/**
 * Prompts centralisés pour la génération de cartes AI.
 */
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
export declare function getPromptsForMode(studyMode?: StudyMode, subjectMode?: SubjectMode): PromptSet;
/**
 * Alias rétrocompatible.
 */
export declare function getPrompts(studyMode?: StudyMode, subjectMode?: SubjectMode): PromptSet;
//# sourceMappingURL=index.d.ts.map