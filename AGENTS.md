# Consignes pour les agents (Claude Code, Codex, ChatGPT)

## Lire le contexte d'abord

Avant de travailler sur Soma, lire `context.md`. On y trouve l'architecture, le déploiement, les commandes, les quotas, les types de cartes et l'historique récent.

## Tenir `context.md` à jour, sans qu'on le demande

`context.md` doit toujours décrire l'état réel de `main`. Sa mise à jour fait partie de chaque changement, comme les tests : on ne l'oublie pas et on n'attend pas qu'on la demande.

**Quand.** Dans chaque branche qui change :
- le comportement de l'app ;
- une fonctionnalité ;
- l'architecture, le déploiement, les dépendances importantes ou les variables d'environnement ;
- les commandes ;
- un point connu ou un point à tester.

On met à jour `context.md` **dans la même branche**, avant d'ouvrir la PR. Si la PR est déjà ouverte, on ajoute un commit sur la même branche. On ne fait pas de PR séparée pour la documentation.

**Quoi.**
1. Ajouter une ligne au tableau « Historique récent » : numéro de PR, sujet, et en une ou deux phrases le problème et la solution. Le numéro n'est connu qu'après la création de la PR. Dans ce cas, créer la PR, puis compléter la ligne dans un commit sur la même branche.
2. Mettre à jour les sections touchées par le changement : architecture, routes, variables d'environnement (les noms seulement, jamais les valeurs), plans et quotas, types de cartes, commandes, déploiement.
3. Tenir à jour « Points connus, non traités » et « Pas encore testé » : retirer ce qui est réglé ou vérifié, ajouter ce que le changement laisse ouvert.
4. Mettre à jour la date « Dernière mise à jour ».
5. Si une section dépasse une vingtaine de lignes d'historique, résumer les entrées les plus anciennes.

**Exceptions.** Une correction de faute de frappe, un changement de style sans effet visible ou un changement qui ne touche que `context.md` ne demandent pas de nouvelle entrée.

**Règles d'écriture.**
- Écrire en français, avec des phrases courtes et factuelles.
- N'écrire que ce qui a été vérifié dans le code ou en production. Ce qui n'a pas été testé va dans « Pas encore testé ».
- Ne jamais écrire de secret : ni clé, ni jeton, ni mot de passe, ni valeur de variable d'environnement.

## Autres consignes

- Branches et PR vers `main`. Ne pas fusionner sans l'accord de Sacha.
- Quand une PR touche à la fois le backend et le frontend, le backend Railway doit être en ligne avant le frontend Vercel.
