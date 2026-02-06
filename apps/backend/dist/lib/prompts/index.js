"use strict";
/**
 * Prompts centralisés pour la génération de cartes AI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromptsForMode = getPromptsForMode;
exports.getPrompts = getPrompts;
const default_1 = require("./default");
const prepa_maths_1 = require("./prepa-maths");
/**
 * Retourne le jeu de prompts approprié selon le mode d'étude et la matière
 */
function getPromptsForMode(studyMode, subjectMode) {
    const mode = studyMode || "general";
    const subject = subjectMode || "general";
    if (mode === "prepa" && subject === "maths") {
        return prepa_maths_1.PREPA_MATHS_PROMPTS;
    }
    return default_1.DEFAULT_PROMPTS;
}
/**
 * Alias rétrocompatible.
 */
function getPrompts(studyMode, subjectMode) {
    return getPromptsForMode(studyMode, subjectMode);
}
//# sourceMappingURL=index.js.map