# Soma : contexte du projet

Point d'entrée pour reprendre le projet. Il résume l'architecture, le déploiement, les commandes et l'historique récent. Les détails restent dans les fichiers cités.

Dernière mise à jour : 11 novembre 2026.

## Le produit

Soma est une application de révision par répétition espacée pour les étudiants, en ligne sur **soma-edu.com**. On crée des paquets de cartes à la main, par import (Anki, PDF, photo) ou par génération IA, puis on les révise selon un algorithme de planification.

Le README présente encore l'ancien nom, Synapse.

## Architecture

| Partie | Techno | Hébergement | Emplacement |
|---|---|---|---|
| Frontend web | Next.js 15 (App Router), React 19, TypeScript, Tailwind, shadcn/ui | Vercel, Node 22.x, pnpm | `src/` |
| Backend API | Express, TypeScript | Railway, Node 22, npm | `apps/backend/` |
| Base de données et auth | Supabase (Postgres, Auth, RLS, Storage) | Supabase | `supabase/` |
| App iOS | Capacitor 8, coquille native qui charge le site | App Store | `ios/`, `capacitor.config.ts` |
| Abonnements iOS | RevenueCat (`@revenuecat/purchases-capacitor` 13.8) | — | `src/services/revenuecat.ts` |
| Paiements web | Stripe | — | `apps/backend/src/routes/stripe.ts` |

### L'app iOS charge le site en production

`capacitor.config.ts` pointe `server.url` vers `https://soma-edu.com/decks?app=1`. En conséquence :
- tout changement du frontend déployé sur Vercel arrive dans l'app iOS sans passer par l'App Store ;
- seuls les changements natifs demandent un nouveau build : plugins, RevenueCat, configuration Capacitor, icônes.

`ios/App/App/capacitor.config.json` est généré et ignoré par git. Après une modification de la config, lancer `npx cap sync ios`.

### Backend (Railway)

- Projet Railway `remarkable-wonder`, service **SOMA**, URL `soma-production-9cd3.up.railway.app`.
- Le service se construit avec Railpack et `npm install` à partir de `apps/backend/package-lock.json`, qui est commité.
- **Node 22 obligatoire** (`engines.node` à `22`). Sous Node 20, `@supabase/supabase-js` plante à la création du client (« Node.js 20 detected without native WebSocket support »), et toute requête authentifiée renvoie une erreur 500 « Authentication failed ».
- Routes, montées dans `apps/backend/src/index.ts` :
  - `/stripe` : `checkout`, `portal` et webhook ;
  - `/anki/import` ;
  - `/pdf` : `import`, `generate-cards` ;
  - `/generate` : `cards`, `confirm` ;
  - `/languages` : `extract-vocabulary-text`, `parse-vocabulary`, `import`.
- Toutes les routes sauf `/stripe` passent par `requireAuth` (`apps/backend/src/middleware/auth.ts`).
- Contrôles de santé : `/health` renvoie 200, et une requête avec un jeton invalide doit renvoyer 401, pas 500.

### Routes API Next.js

Dans `src/app/api/` : `push-token`, `delete-account`, `quota`, `auth/ensure-profile`, `revenuecat/sync-plan`.

### Supabase

- Projet `rxmkdaishtztqrjvfihy`.
- Les migrations sont dans `supabase/migrations/`.
- L'Edge Function `send-daily-review-push` envoie les rappels quotidiens.
- `profiles` est la source de vérité pour le plan et le quota.

## Variables d'environnement

Les valeurs ne sont jamais commitées. Elles se trouvent dans Vercel, Railway et `.env.local`.

- **Frontend** :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_BACKEND_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_REVENUECAT_IOS_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Backend** :
  - Supabase : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Origines : `FRONTEND_URL`, `CORS_ORIGIN`
  - Stripe : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `SOMA_STARTER_PRICE_ID`, `SOMA_PRO_PRICE_ID`
  - IA : `OPENAI_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
  - `PORT`

## Plans et quotas

- Plans : `free`, `starter`, `pro`, stockés dans `profiles.plan`.
- Le plan gratuit donne **30 cartes IA à vie** (`FREE_TRIAL_LIMIT` dans `apps/backend/src/lib/plan-limits.ts`). Le compteur est `profiles.ai_free_trial_used`.
- Au-delà, le backend renvoie `QUOTA_FREE_PLAN`, ou `FREE_TRIAL_LIMIT_REACHED` quand les 30 cartes sont épuisées.
- Un import de vocabulaire est plafonné à 50 cartes par le serveur.

### Supabase : plan et stockage

- L'organisation Supabase est au plan **Pro**. Le passage au plan gratuit a été évalué le 11 novembre 2026 et écarté pour l'instant.
- Ce qui bloque, c'est le stockage de fichiers. Le bucket `card-media` contient environ 830 Mo, pour une limite gratuite de 1 Go, et augmentait d'environ 200 Mo par mois. La base ne fait que 39 Mo, pour une limite gratuite de 500 Mo.
- La quasi-totalité du volume vient des photos ajoutées dans l'éditeur de carte : 1,5 Mo en moyenne, envoyées sans compression avant la PR #22.
- Depuis la PR #22, les images sont compressées dans le navigateur avant l'envoi (`src/lib/image-compression.ts`) :
  - côté le plus long limité à 1 600 px, ou 2 000 px dans l'éditeur de diagramme ;
  - JPEG en qualité 0,8 ;
  - les PNG et WebP transparents restent en WebP ou PNG ;
  - les GIF et SVG ne sont pas touchés ;
  - le fichier d'origine est gardé quand la compression ne réduit pas sa taille.

## Types de cartes et modes

Les types sont définis dans `src/lib/card-types.ts`, et l'affichage passe par `src/components/StudyCard.tsx`.

| Mode | Types de cartes | Composant de révision |
|---|---|---|
| Classique | `basic`, `reversible`, `typed` | `BasicCard`, `ReversibleCard`, `TypedCard` |
| Maths | `definition`, `property`, `formula` | Révisés comme `basic` |
| Langues | `vocabulary`, `grammar_rule` | Révisés comme `basic`, ou `reversible` en direction Aléatoire |
| Philosophie | `philosophy_concept` | `PhilosophyConceptCard` |
| Droit | `statute_article`, `case_brief`, `practical_case` | `LawCard` |
| Médecine | `med_definition`, `med_presentation`, `med_diagnosis`, `med_treatment`, `med_clinical_case` | `MedicineCard` |
| Tous les modes | `diagram` | `DiagramCard` |

- **Direction Aléatoire** (paquets de langues) : elle est stockée dans `decks.config.vocabDirection = "random"`. Le côté montré est tiré à chaque présentation par `getReversibleOrientation()`.
- **Rappel de la question** : depuis le 11 novembre, toutes les cartes à retourner affichent la question au verso. Pour les cartes basiques et réversibles, le rappel reste fixé en haut quand on fait défiler une réponse longue.
- **Planification** : l'algorithme est documenté dans `src/lib/scheduler.README.md`.

## Commandes

```bash
pnpm install                         # dépendances du frontend (utiliser pnpm 10)
pnpm dev                             # frontend sur localhost:3000
npm run typecheck                    # vérification TypeScript du frontend
pnpm test:run                        # tests Vitest (src/lib/*.test.ts) ; vitest n'est pas dans les dépendances, voir ci-dessous
cd apps/backend && npm install && npm run dev                                  # backend en local
cd apps/backend && npm run build && node --test test/vocabulary.test.cjs       # tests du backend
npx cap sync ios                     # après un changement natif ou de config Capacitor
set -a; source .env.local; set +a; npx -y tsx scripts/cleanup-orphan-media.mts --out orphans.csv   # liste des images orphelines (simulation)
```

Points d'attention :
- Les 13 échecs de `scheduler.test.ts` existaient déjà sur `main` avant les changements de novembre.
- ESLint n'est pas configuré : `next lint` demande une migration de configuration.
- pnpm 11 refuse le store créé par pnpm 10. Utiliser `npx -y pnpm@10` si besoin.
- `vitest` est appelé par les scripts, mais il n'est pas installé dans les dépendances, et `vitest.config.ts` ne se charge donc pas. En attendant, lancer `npx -y vitest@3.2.4 run --config <config>` avec une config temporaire qui reprend l'alias `@` vers `src`.

## Déploiement

1. Une PR vers `main`. Vercel publie une préview et ajoute un check sur la PR.
2. La fusion dans `main` déclenche le déploiement automatique sur Vercel (frontend) et sur Railway (backend).
3. Quand une PR touche à la fois l'API et le frontend, le backend Railway doit être en ligne **avant** le frontend.
4. Vérifier :
   - le statut Vercel du commit de fusion ;
   - le dernier déploiement Railway, en SUCCESS et sous Node 22 ;
   - `/health` du backend.
5. L'app iOS n'a besoin d'un nouveau build dans Xcode que pour un changement natif.

Outils en ligne de commande :
- `gh` est installé dans `~/.local/bin`.
- Railway s'utilise avec `npx -y @railway/cli` (`logs`, `status`), déjà relié au service SOMA.

## Historique récent (novembre 2026)

| PR | Sujet | Détails |
|---|---|---|
| #15 | Vocabulaire japonais (retours d'Ayman B.) | Mots dans les mauvaises cases après import, côté de révision jamais aléatoire. Corrigé par la préservation des séparateurs OCR, le contrôle des écritures, la confirmation des paires ambiguës et le mode Aléatoire. Détail complet dans `docs/retours-utilisateurs.md`. |
| #16 | Build iOS avec Xcode 27.2 | RevenueCat passe de 12.2.2 à 13.8.0 (`purchases-ios` 5.99.0). La version 14.x a été écartée parce qu'elle change le comportement de `configure()`. |
| #17 | Erreur « Authentication failed » en production | Le backend tournait sous Node 20. Passage à Node 22. |
| #18 | Lockfile du backend commité | Builds Railway reproductibles. |
| #19 | Question visible au verso (retour de Margot) | Avec une réponse longue, on oubliait la question. |
| #20 | Ajout de `context.md` | Vue d'ensemble du projet en un seul fichier. |
| #21 | Mise à jour automatique de `context.md` | `AGENTS.md`, repris par `CLAUDE.md`, demande aux agents de tenir ce fichier à jour dans chaque branche qui change l'app. |
| #22 | Compression des images à l'envoi | Les photos des cartes partaient en pleine résolution et remplissaient le stockage Supabase. Elles sont maintenant réduites dans l'éditeur de carte et dans l'éditeur de diagramme. Exemple : une photo de 4,2 Mo passe à 300 Ko dans Chromium et à 620 Ko dans Safari iOS. |
| #23 | Nettoyage des images des comptes supprimés | La suppression d'un compte laissait ses fichiers dans Storage. Elle efface maintenant tout ce qui se trouve sous `<userId>/` dans `card-media` et `pdfs`. La PR ajoute aussi un script pour repérer les orphelins existants (simulation par défaut, sauvegarde obligatoire avant suppression). |

## Points connus, non traités

- Le bouton d'import de vocabulaire affiche « Extracting text » avant tout lancement, au lieu de `extractText` (`src/components/VocabularyImportDialog.tsx`). Laissé tel quel volontairement.
- Le compteur de l'aperçu d'import ne tient pas compte du quota gratuit restant.
- Le bouton « Show answer » de `BasicCard` est codé en dur en anglais, alors que `ReversibleCard` utilise `t("study.showAnswer")`.
- Le README est à mettre à jour : il parle encore de Synapse et ne mentionne pas Railway ni l'app iOS.
- Stockage Supabase, suite du plan de réduction après la PR #22 :
  - **Fichiers orphelins** : 4 346 fichiers, 158 Mo, identifiés le 11 novembre par `scripts/cleanup-orphan-media.mts` (voir Commandes). Ils se répartissent ainsi :
    - 3 878 fichiers (52 Mo) appartiennent à des comptes supprimés ;
    - 468 fichiers (106 Mo) ne sont référencés nulle part : ni par leur chemin, ni par leur nom, dans `cards`, `generated_cards`, `imports` ou `decks`.
    - Sont gardés par prudence : les fichiers de moins de 7 jours, et les images Anki dont le nom apparaît dans une carte sans lien complet.
    - Suppression en attente de validation.
  - **Comptes supprimés** : réglé dans la PR #23. `/api/delete-account` efface maintenant les fichiers de l'utilisateur (`src/lib/storage-cleanup.ts`).
  - **Images existantes** : environ 620 Mo de photos déjà en ligne n'ont pas été recompressées.
  - **Import Anki** : les images importées (141 Mo) ne sont pas compressées par le backend.

## Pas encore testé

- L'import par photo avec l'appareil photo sur un iPhone physique, en production.
- L'import d'un PDF dans l'app native.
- L'achat et la restauration d'achat avec RevenueCat 13.8.0. À faire en sandbox TestFlight avant la prochaine version App Store.
- Une archive signée pour un vrai appareil.
- L'envoi d'une vraie photo dans l'éditeur de carte, connecté, jusqu'à son affichage en révision. La compression elle-même a été testée dans Chromium et dans Safari iOS (simulateur).

## Autres documents

- `AGENTS.md` (repris par `CLAUDE.md`) : consignes pour les agents, dont la mise à jour de ce fichier dans chaque branche qui change l'app.
- `docs/retours-utilisateurs.md` : journal détaillé du chantier vocabulaire japonais.
- `src/lib/scheduler.README.md` : algorithme de répétition espacée.
- `apps/backend/ROUTE_ADAPTATION_NOTES.md` : notes sur les routes du backend.
- `PROFILES_RESET_EXPLANATION.md` : réinitialisation des profils.
