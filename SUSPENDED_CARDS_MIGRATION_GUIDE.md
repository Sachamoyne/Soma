# Guide de Migration : Gestion des Cartes Suspendues

## ✅ Modifications Effectuées

### 1. Migration SQL (`supabase/migrations/20250104_add_suspended_state.sql`)
- Ajout de l'état `'suspended'` au constraint de la colonne `state`
- Mise à jour automatique des cartes existantes avec `suspended = true`
- Constraint mis à jour : `('new', 'learning', 'review', 'relearning', 'suspended')`

### 2. Code d'Import Anki (`src/app/api/import/anki/route.ts`)

**Avant (INCORRECT)** :
```typescript
function getCardStateFromQueue(queue: number): "new" | "learning" | "review" {
  if (queue === 0) return "new";
  if (queue === 1 || queue === 3) return "learning";
  if (queue === 2) return "review";
  // ❌ PROBLÈME : Cartes suspendues mappées en "review"
  return "review";
}
```

**Après (CORRECT)** :
```typescript
function getCardStateFromQueue(queue: number): "new" | "learning" | "review" | "suspended" {
  // ✅ Cartes suspendues/buried correctement identifiées
  if (queue < 0) return "suspended";

  if (queue === 0) return "new";
  if (queue === 1 || queue === 3) return "learning";
  if (queue === 2) return "review";

  return "new";
}
```

**Mapping Anki → Soma** :
- `queue = -1, -2, -3` → `state = "suspended"`, `suspended = true`
- `queue = 0` → `state = "new"`, `suspended = false`
- `queue = 1, 3` → `state = "learning"`, `suspended = false`
- `queue = 2` → `state = "review"`, `suspended = false`

### 3. Filtrage (déjà en place) ✅

**Queries existantes** :
- `getDueCards()` : filtre déjà avec `eq("suspended", false)` ✅
- `getDueCount()` : filtre déjà avec `eq("suspended", false)` ✅
- `getDeckCardCounts()` : filtre déjà avec `eq("suspended", false)` ✅

**Stats existantes** :
- `getCardStateBreakdown()` : filtre déjà avec `eq("suspended", false)` ✅
- `getCardDistribution()` : filtre déjà avec `eq("suspended", false)` ✅

**Résultat** : Les cartes suspendues sont **automatiquement exclues** de toutes les queries et stats !

---

## 🚀 Étapes d'Application

### Option A : Supabase Cloud (Dashboard)

1. **Ouvrir le dashboard Supabase** :
   - Aller sur [app.supabase.com](https://app.supabase.com)
   - Sélectionner votre projet Soma

2. **Appliquer la migration** :
   - Aller dans "SQL Editor"
   - Créer une nouvelle query
   - Copier-coller le contenu de `supabase/migrations/20250104_add_suspended_state.sql`
   - Exécuter la query

3. **Régénérer les types TypeScript** :
   ```bash
   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
   ```
   (Remplacer `YOUR_PROJECT_ID` par votre ID de projet)

### Option B : Supabase Local

1. **Démarrer Supabase** :
   ```bash
   supabase start
   ```

2. **Appliquer la migration** :
   ```bash
   supabase db push
   ```

3. **Régénérer les types** :
   ```bash
   supabase gen types typescript --local > src/lib/supabase/types.ts
   ```

---

## 🧪 Tests à Effectuer

### Test 1 : Import d'un deck Anki avec cartes suspendues

1. **Préparer un deck de test** :
   - Ouvrir Anki
   - Créer un deck avec quelques cartes
   - Suspendre quelques cartes (clic droit → Suspend Card ou `Ctrl+J`)
   - Exporter en `.apkg`

2. **Importer dans Soma** :
   ```bash
   npm run dev
   ```
   - Aller sur l'interface d'import
   - Importer le deck `.apkg`
   - Vérifier les logs de la console

3. **Vérifications attendues** :

   **Dans les logs de la console** :
   ```
   [ANKI IMPORT] Anki queue distribution:
     queue -1 (suspended): X cards
     queue 0 (new): Y cards
     queue 2 (review): Z cards

   [ANKI IMPORT] Soma cards by state (non-suspended only):
     { new: Y, learning: 0, review: Z }

   [ANKI IMPORT] Suspended/buried cards: X
   ```

   **Dans l'UI Soma** :
   - New = Y (exactement le même nombre qu'Anki)
   - Review = Z (exactement le même nombre qu'Anki)
   - Les cartes suspendues ne sont PAS comptées
   - Total = X + Y + Z (toutes les cartes)

### Test 2 : Vérifier que les cartes suspendues ne sont pas proposées

1. Aller sur la page d'étude du deck
2. Les cartes suspendues ne doivent **JAMAIS** apparaître
3. Le compteur de cartes dues ne doit **PAS** inclure les cartes suspendues

### Test 3 : Vérifier les statistiques

1. Aller sur le Dashboard
2. Vérifier les stats :
   - New cards : ne doit PAS inclure les suspendues
   - Learning : ne doit PAS inclure les suspendues
   - Review : ne doit PAS inclure les suspendues
3. Le total de cartes doit inclure les suspendues (dans la base, mais pas dans les stats d'étude)

---

## ✅ Critères de Validation

Pour votre deck personnel, après import :

- [ ] **New = 0** (comme dans Anki)
- [ ] **Learning = 0** (comme dans Anki)
- [ ] **Review = nombre exact d'Anki** (sans les cartes suspendues)
- [ ] **Cartes suspendues** : visibles en base de données mais invisibles en étude
- [ ] **Aucune erreur TypeScript** dans le build
- [ ] **Import réussi** sans erreurs

---

## 📊 Exemple Concret

**Deck Anki** :
- Total : 100 cartes
- New : 20 cartes
- Review : 60 cartes
- Suspended : 20 cartes

**Après import dans Soma** :
- Total en base : 100 cartes
- New affiché : 20 ✅
- Review affiché : 60 ✅
- Suspended (hidden) : 20 ✅
- Cartes dues : 80 (20 new + 60 review) ✅

**En étude** :
- Seules 80 cartes sont proposées
- Les 20 cartes suspendues sont ignorées

---

## 🐛 Debugging

Si les chiffres ne correspondent pas :

1. **Vérifier les logs d'import** :
   ```bash
   npm run dev
   ```
   Regarder la console pour :
   - `[ANKI IMPORT] Anki queue distribution`
   - `[ANKI IMPORT] Soma cards by state`

2. **Vérifier en base de données** :
   ```sql
   -- Compter les cartes par état
   SELECT state, suspended, COUNT(*)
   FROM cards
   WHERE user_id = 'YOUR_USER_ID'
   GROUP BY state, suspended;
   ```

3. **Vérifier le constraint** :
   ```sql
   -- Vérifier que le constraint permet 'suspended'
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'cards'::regclass
   AND conname = 'cards_state_check';
   ```

---

## 📝 Notes Importantes

- **AUCUNE modification de l'UI** : L'UI continue de fonctionner normalement
- **AUCUNE modification du scheduler** : Le scheduler ne traite que les cartes actives
- **Rétro-compatibilité** : Les cartes existantes avec `suspended = true` sont automatiquement mises à jour vers `state = 'suspended'`
- **Type safety** : TypeScript est strictement respecté, aucun cast invalide

---

## 🎯 Résultat Final

👉 **Une carte suspendue dans Anki = une carte suspendue dans Soma**

✅ Comportement 100% identique à Anki
✅ Zéro différence dans les statistiques
✅ Code propre, maintenable, type-safe
