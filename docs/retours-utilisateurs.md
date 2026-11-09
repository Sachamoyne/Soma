# Retours utilisateurs Soma

Branche locale `codex/retours-utilisateurs`, créée depuis `main` au commit `7699b6d`.

## Vocabulaire japonais

Deux symptômes signalés le 9 novembre 2026. Des mots peuvent se retrouver dans les mauvaises cases après un import. Le côté présenté en révision reste fixe alors que l’utilisateur attend un choix aléatoire.

1. Préserver les séparateurs à l’extraction, identifier les langues indépendamment de la position des colonnes et demander une confirmation explicite des paires ambiguës. Vérifier séparément les images et les PDF.
2. Ajouter le réglage Aléatoire aux paquets de langues existants et nouveaux. Tirer le côté à chaque présentation sans recréer les cartes. Garder le comportement actuel de Normal, Inverse et Les deux directions.

État initial vérifié. La normalisation OCR supprimait les tabulations utilisées par le parseur de secours. Une entrée en mode Les deux directions créait deux cartes fixes. Le mode Inverse montré dans la capture créait une carte fixe en sens inverse.

### Import

- `apps/backend/src/routes/languages.ts` et `apps/backend/src/lib/vocabulary.ts` conservent les lignes et les séparateurs. Le contrôle des écritures corrige les inversions manifestes japonais–français ou japonais–anglais. Les associations incertaines remontent dans l'aperçu.
- `apps/backend/src/routes/pdf.ts` conserve la mise en page extraite avec `/pdf/import?layout=vocabulary`. Les PDF doivent contenir du texte sélectionnable. Le parseur PDF peut restituer certains espaces entre colonnes comme un espace simple.
- `src/components/VocabularyImportDialog.tsx` propose le PDF et demande de confirmer ou retirer chaque paire signalée avant la création des cartes.
- Tests du backend depuis `apps/backend` avec `npm run build && node --test test/vocabulary.test.cjs`. Le modèle est simulé pour les images. Le test PDF extrait le texte d'un petit document généré dans le test.
