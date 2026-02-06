"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROMPTS = void 0;
exports.DEFAULT_PROMPTS = {
    analyzeContent: `Tu es un expert en extraction de concepts pédagogiques.

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
- Couvrir TOUS les concepts importants du texte`,
    generateFromAnalysis: (conceptsList, cardCountInstruction, detailInstruction) => `Tu es un expert en création de flashcards pour la mémorisation efficace.

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
}`,
    fallback: (cardCountInstruction, detailInstruction, retryCorrection) => `Tu es un expert en création de flashcards pour la mémorisation efficace et l'apprentissage conceptuel.

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

${retryCorrection}`,
};
//# sourceMappingURL=default.js.map