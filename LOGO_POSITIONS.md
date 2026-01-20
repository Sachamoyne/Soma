# Guide des Positions et Tailles du Logo OMA

Ce document liste tous les emplacements où le logo OMA est utilisé sur le site, avec leurs tailles et positions actuelles.

## 📍 Emplacements du Logo

### 1. **Landing Page - Header (en haut à gauche)**
- **Fichier** : `src/app/page.tsx`
- **Ligne** : ~53
- **Taille actuelle** : `logoSize={40}`
- **Position** : Dans un `<h1>` avec `text-lg font-semibold tracking-wide`
- **Classe CSS** : `className="landing-page-logo"`
- **Code** :
```tsx
<h1 className="text-lg font-semibold tracking-wide whitespace-nowrap text-white/90">
  <BrandName logoSize={40} className="landing-page-logo" />
</h1>
```
- **Pour modifier** :
  - **Taille** : Changez `logoSize={40}` (valeur en pixels)
  - **Position horizontale** : Ajoutez/modifiez `-ml-X` ou `ml-X` sur le `<h1>` (ex: `-ml-3` pour décaler à gauche)
  - **Position verticale** : Modifiez les classes de padding/alignement du conteneur parent

---

### 2. **Landing Page - Section "About"**
- **Fichier** : `src/app/page.tsx`
- **Ligne** : ~183
- **Taille actuelle** : `logoSize={40}`
- **Position** : Dans un `<h2>` à côté du texte "A propos de" / "About"
- **Code** :
```tsx
<h2 className={`${playfair.className} text-3xl text-white/90 flex items-center gap-2`}>
  {t("landing.aboutTitle").replace(APP_NAME, "").trim()}{" "}
  <BrandName logoSize={40} />
</h2>
```
- **Pour modifier** :
  - **Taille** : Changez `logoSize={40}`
  - **Espacement avec le texte** : Modifiez `gap-2` (ex: `gap-3` pour plus d'espace, `gap-1` pour moins)
  - **Alignement vertical** : Le `flex items-center` aligne déjà le logo avec le texte

---

### 3. **Page Login - Titre "Sign in to OMA"**
- **Fichier** : `src/app/login/LoginClient.tsx`
- **Ligne** : ~299
- **Taille actuelle** : `logoSize={52}`
- **Position** : Dans un `<h1>` à côté du texte "Connexion à" / "Sign in to"
- **Code** :
```tsx
<h1 className={`${playfair.className} text-2xl font-semibold text-white flex items-center gap-3 justify-center`}>
  <span>{t("auth.signIn", { appName: APP_NAME }).replace(APP_NAME, "").trim()}</span>
  <BrandName logoSize={52} />
</h1>
```
- **Pour modifier** :
  - **Taille** : Changez `logoSize={52}`
  - **Espacement avec le texte** : Modifiez `gap-3` (ex: `gap-4` pour plus, `gap-2` pour moins)
  - **Alignement vertical** : Le `flex items-center` aligne déjà le logo avec le texte
  - **Alignement horizontal** : Le `justify-center` centre le tout

---

### 4. **Sidebar (Page Principale) - Header**
- **Fichier** : `src/components/shell/AppSidebar.tsx`
- **Ligne** : ~39
- **Taille actuelle** : `logoSize={80}`
- **Position** : Dans un `<h1>` avec `text-2xl font-semibold` et décalage `-ml-3`
- **Code** :
```tsx
<h1 className="text-2xl font-semibold tracking-wide whitespace-nowrap text-white/90 -ml-3">
  <BrandName logoSize={80} />
</h1>
```
- **Pour modifier** :
  - **Taille** : Changez `logoSize={80}`
  - **Position horizontale** : Modifiez `-ml-3` (ex: `-ml-4` pour plus à gauche, `-ml-2` pour moins, `ml-2` pour à droite)
  - **Taille du texte** : Modifiez `text-2xl` (ex: `text-xl` pour plus petit, `text-3xl` pour plus grand)

---

### 5. **Page Pricing - Header (en haut à gauche)**
- **Fichier** : `src/app/pricing/PricingClient.tsx`
- **Ligne** : ~118
- **Taille actuelle** : `logoSize={40}`
- **Position** : Dans un `<Link>` avec `text-xs font-semibold tracking-[0.35em]`
- **Code** :
```tsx
<Link
  className="text-xs font-semibold tracking-[0.35em] text-white/85"
  href="/"
>
  <BrandName logoSize={40} />
</Link>
```
- **Pour modifier** :
  - **Taille** : Changez `logoSize={40}`
  - **Position horizontale** : Ajoutez `-ml-X` ou `ml-X` sur le `<Link>` ou son conteneur
  - **Taille du texte** : Modifiez `text-xs` (mais ici c'est juste pour le style du conteneur)

---

## 🎨 Composant BrandName

Le composant principal se trouve dans : `src/components/BrandName.tsx`

**Taille par défaut** : `logoSize = 150` (actuellement)

**Structure actuelle** :
```tsx
export function BrandName({ className = "", logoSize = 150 }: BrandNameProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/logo/OMA-removebg-preview.svg"
        alt="OMA Logo"
        width={logoSize}
        height={logoSize}
        className="object-contain flex-shrink-0"
        priority
      />
    </div>
  );
}
```

**Pour modifier globalement** :
- **Taille par défaut** : Changez `logoSize = 150` dans la fonction
- **Fichier logo** : Changez `src="/logo/OMA-removebg-preview.svg"` si vous voulez utiliser un autre logo

---

## 📝 Résumé des Tailles Actuelles

| Emplacement | Fichier | Taille (px) | Position |
|------------|---------|-------------|----------|
| Landing - Header | `src/app/page.tsx` ligne 53 | 40 | Header, gauche |
| Landing - About | `src/app/page.tsx` ligne 183 | 40 | Section About, à côté du titre |
| Login - Titre | `src/app/login/LoginClient.tsx` ligne 299 | 52 | Centre, à côté du texte |
| Sidebar | `src/components/shell/AppSidebar.tsx` ligne 39 | 80 | Header sidebar, décalé `-ml-3` |
| Pricing - Header | `src/app/pricing/PricingClient.tsx` ligne 118 | 40 | Header, gauche |

---

## 🔧 Comment Modifier

### Pour changer la taille :
Remplacez `logoSize={XX}` par la valeur souhaitée en pixels.

### Pour changer la position horizontale :
- **Décaler à gauche** : Ajoutez `-ml-X` (ex: `-ml-2`, `-ml-3`, `-ml-4`)
- **Décaler à droite** : Ajoutez `ml-X` (ex: `ml-2`, `ml-3`)
- **Centrer** : Utilisez `mx-auto` ou `justify-center` sur le conteneur

### Pour changer la position verticale :
- **Décaler vers le haut** : Ajoutez `-mt-X` ou modifiez le padding du conteneur
- **Décaler vers le bas** : Ajoutez `mt-X` ou modifiez le padding du conteneur
- **Aligner avec le texte** : Utilisez `flex items-center` (déjà présent dans la plupart des cas)

### Pour changer l'espacement avec le texte :
Modifiez la valeur de `gap-X` dans les conteneurs flex (ex: `gap-2`, `gap-3`, `gap-4`)

---

## 💡 Exemples de Modifications

**Exemple 1 : Grossir le logo de la sidebar**
```tsx
// Avant
<BrandName logoSize={80} />

// Après
<BrandName logoSize={100} />
```

**Exemple 2 : Décaler le logo de la landing page plus à gauche**
```tsx
// Avant
<h1 className="text-lg font-semibold tracking-wide whitespace-nowrap text-white/90">
  <BrandName logoSize={40} className="landing-page-logo" />
</h1>

// Après
<h1 className="text-lg font-semibold tracking-wide whitespace-nowrap text-white/90 -ml-4">
  <BrandName logoSize={40} className="landing-page-logo" />
</h1>
```

**Exemple 3 : Augmenter l'espacement entre le texte et le logo dans "About"**
```tsx
// Avant
<h2 className={`${playfair.className} text-3xl text-white/90 flex items-center gap-2`}>

// Après
<h2 className={`${playfair.className} text-3xl text-white/90 flex items-center gap-4`}>
```
