Synapse est une application d’apprentissage basée sur la répétition espacée, conçue pour aider les étudiants et knowledge workers à retenir durablement ce qu’ils apprennent.
L’objectif est simple : transformer n’importe quel contenu (cours, notes, PDF, Anki, etc.) en cartes efficaces, puis optimiser leur révision dans le temps.

**Vision** : 
La plupart des outils d’apprentissage échouent sur un point clé : la mémorisation long terme.
Synapse se concentre uniquement sur ce problème, avec une approche minimaliste, rapide et orientée efficacité.
Pas de bruit. Pas de gamification inutile.
Juste ce qui permet d’apprendre mieux.

**Fonctionnalités principales** : 
- Création et gestion de decks
- Révision via répétition espacée
- Interface rapide et épurée
- Authentification sécurisée
- Statistiques de révision
- Import de cartes (ex. Anki)
- Paramètres personnalisés par utilisateur

**Stack technique** : 
- Frontend : Next.js (App Router), TypeScript
- UI : TailwindCSS, shadcn/ui
- Backend : Supabase (Auth, Database, RLS, Storage)
- DB : PostgreSQL
- Hosting : Vercel
- Auth & sécurité : Supabase Auth + Row Level Security

**Statut du projet** : 
MVP en cours de développement
Testé en conditions réelles par des étudiants
Itérations rapides orientées produit

**Objectif à court terme** : 
Stabiliser l’expérience de révision
Finaliser les performances (latence, navigation)
Ouvrir progressivement à des utilisateurs externes (beta)
