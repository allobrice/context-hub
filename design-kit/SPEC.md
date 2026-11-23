# Context Hub — Spécification UI v1

Source de vérité fonctionnelle et visuelle pour l'implémentation React.
Référence visuelle : `maquettes/png/*.png` (rendu attendu) et `maquettes/html/*.html` (markup et styles exacts, statiques).
En cas d'écart entre ce document et une maquette, **ce document fait foi** ; signale l'écart.

## 1. Correspondance écrans ↔ maquettes

| Écran | Route | Maquettes |
|---|---|---|
| Bibliothèque | `/` | 01 tableau · 02 cartes · 03 sombre · 04 vide · 05 chargement · 06 erreur · 07 aucun résultat |
| Détail | `/contexts/:id` | 08 · 09 sombre · 10 chargement · 11 introuvable (404) |
| Création / édition | `/contexts/new`, `/contexts/:id/edit` | 12 secret détecté + autocomplétion tags · 13 sombre, scan OK · 14 création vide · 15 conflit de version |
| Tags & collections | `/taxonomy?tab=tags\|collections` | 16 tags + renommage inline · 17 fusion · 18 sombre · 19 chargement · 20 vide · 21 collections · 22 suppression de collection |

`maquettes/manifest.json` liste chaque maquette avec l'écran et l'état qu'elle représente.

Interactions présentes dans les sources mais non capturées en image : bascule Aperçu/Markdown (Détail), bascule CLI/.mcp.json (Détail), « Copié ✓ » après copie, portée « Projet » qui fait apparaître le champ repo (Éditeur), onglets (Taxonomie), bascule de thème (sidebar).

## 2. Modèle de domaine

```ts
type ContextId = string & { readonly __brand: 'ContextId' }
type Slug = string // ex. "nuxt/conventions-nuxt-4", unique, figé après la v1
type Scope =
  | { kind: 'personal'; owner: string }
  | { kind: 'project'; repo: string }   // ex. "allovoisins/front"
  | { kind: 'team'; team: string }
type ContextStatus = 'draft' | 'published' | 'archived'

interface ContextVersion {        // immuable
  number: number; content: string; note: string
  author: string; createdAt: string; tokenEstimate: number
}
interface Context {
  id: ContextId; slug: Slug; title: string; description: string // ≤ 160 car.
  collectionId: string | null; tags: string[]; scope: Scope; status: ContextStatus
  publishedVersion: ContextVersion | null   // celle que lisent les sessions MCP
  draft: ContextVersion | null              // révision en cours au-dessus de la version publiée
  createdAt: string; updatedAt: string; author: string; mcpReads7d: number
}
interface Tag { name: string; contextCount: number; publishedCount: number; lastUsedAt: string | null }
interface Collection { id: string; name: string; description: string; contextCount: number; publishedCount: number; system?: true }
type ScanFinding =
  | { kind: 'secret'; line: number; pattern: string; label: string }
  | { kind: 'suspicious-instruction'; line: number; excerpt: string }
```

Règles métier (fonctions pures, testées) :
- `resourceUri(ctx)` → `context://{slug}` ; `pinnedUri(ctx, n)` → `context://{slug}@{n}` ; `mention(ctx)` → `@context-hub:context://{slug}`.
- `estimateTokens(md)` : heuristique ≈ caractères / 4, affichée « ≈ ».
- `scanContent(md): ScanFinding[]` : secrets (`sk_live_`, `sk-`, `ghp_`, `AKIA`, `-----BEGIN`, `password=`…) et instructions suspectes (`ignore previous instructions`, URL d'exfiltration…). **Le scan côté UI est indicatif. Le serveur devra le refaire, et c'est lui qui fera autorité.**
- `canPublish(draft, findings)` : faux si un secret est détecté, si le titre est vide ou si la note de version est vide.
- Renommer un tag vers un nom existant = fusion. Supprimer une collection impose une collection cible. « Sans collection » est une collection système : ni renommable, ni supprimable.

## 3. Design system

Look : outil développeur, dense mais lisible, desktop first (1280–1440 px), sans gradient ni décoration.
Les tokens sont dans `tokens/tokens.css` (custom properties, thèmes via `[data-theme]`) et `tokens/tokens.json`.

- **Typo** : Inter (UI) et JetBrains Mono (slugs, URI, tags, compteurs, code). Corps 13 px, libellés 11–12 px, H1 18–20 px. Les fichiers `woff2` sont dans `maquettes/fonts/` (à installer via `@fontsource/*` dans l'app).
- **Rayons** : 4 (badge, tag) · 6 (boutons, champs) · 8 (panneaux) · 10 (dialogs).
- **Hauteurs** : boutons 32 px, sm 26 px ; lignes de tableau ≥ 56 px (bibliothèque), ≥ 44 px (taxonomie).
- **Thème** : `data-theme="light|dark"` sur `<html>`. Valeur par défaut issue de `prefers-color-scheme`, choix persisté en localStorage (try/catch).
- **Statuts** : Publié = ok, Brouillon = warn, Archivé = surface-2/fg-2. Toujours un point et un libellé, jamais la couleur seule.
- **Focus** : contour de 2 px en accent, décalé de 2 px. Contrastes ≥ 4,5:1 (les tokens passent).
- **Icônes** : SVG inline, trait 2 px, `currentColor`, viewBox 24, aucun emoji. Les tracés sont réutilisables depuis `maquettes/html/*`.

## 4. Layout commun

Sidebar de 232 px :
- marque « Context Hub », sous-titre « Espace AlloVoisins » ;
- navigation : Bibliothèque (compteur), Tags & collections, Connexion MCP ;
- liste des collections avec compteurs ;
- portées (Personnel / Projet / Équipe) avec compteurs ;
- en pied : statut du serveur MCP (point et libellé), avatar et bouton de thème (`aria-label`).

Sous 900 px, la sidebar passe au-dessus du contenu (flex-wrap). Elle n'est pas sticky.

## 5. Écrans

Chaque écran gère les états **chargement** (skeletons + `aria-busy`), **vide**, **erreur** (message, code en mono, Réessayer) et **aucun résultat**, quand ils s'appliquent.

### 5.1 Bibliothèque
- En-tête : H1, compteurs (« 42 contextes · 31 publiés · 8 brouillons · 3 archivés »), recherche plein texte (titre, description, tags, contenu) avec ⌘K / Ctrl+K, bouton « Nouveau contexte ».
- Filtres : Tags (multi), Collection, Portée, Statut. Un filtre actif s'affiche en accent-soft avec une croix pour le retirer. Compteur de résultats, tri (mis à jour récent/ancien, titre A→Z/Z→A), bascule Tableau/Cartes.
- **Filtres, tri, recherche et vue sont synchronisés dans l'URL.** La recherche est debouncée.
- Tableau : Titre + description (ellipsis) · Collection · Tags · Portée (+ repo/équipe en mono) · Statut · Version · Tokens · Mis à jour. La ligne entière est un lien. Pagination de 25.
- Cartes : grille auto-fill (min 300 px).
- Vide : ce qu'est un contexte, avec les CTA « Créer un contexte » et « Connecter Claude Code ».
- Aucun résultat : rappelle la requête, puis propose « Retirer les filtres (n) », « Effacer la recherche » et « Créer « {requête} » ».

### 5.2 Détail
- En-tête :
  - fil d'Ariane, titre, description ;
  - badges : statut, vN, portée, ≈ tokens, résultat du scan ;
  - actions : Archiver, Éditer, menu « … ».
- Bandeau warn si un brouillon existe : « Brouillon vN+1 en cours… Les sessions lisent toujours la vN publiée », avec le lien « Reprendre le brouillon ».
- Colonne principale : bascule Aperçu (Markdown sanitisé) / Markdown (source).
- Colonne latérale (360–460 px) :
  - **Utiliser dans Claude Code** :
    - mention, URI et URI figée `@N`, chacune avec un bouton Copier (« Copié ✓ » pendant 2 s + `aria-live`) ;
    - configuration, avec une bascule CLI (scope user) / `.mcp.json` (scope project). `[HÔTE]` vient de `VITE_MCP_HOST`, le jeton de `CONTEXT_HUB_TOKEN` (jamais en clair) :
      ```
      claude mcp add --transport http --scope user context-hub https://[HÔTE]/mcp --header "Authorization: Bearer $CONTEXT_HUB_TOKEN"
      ```
      ```json
      { "mcpServers": { "context-hub": { "type": "http", "url": "https://[HÔTE]/mcp",
        "headers": { "Authorization": "Bearer ${CONTEXT_HUB_TOKEN}" } } } }
      ```
    - une note de sécurité : le contenu est injecté tel quel dans les sessions, à relire avant publication.
  - **Métadonnées** (`dl`) : collection, tags, portée, auteur, créé, mis à jour, lectures MCP sur 7 jours, slug.
  - **Historique** : numéro, note, auteur, date, badge Brouillon/Courante, « Restaurer » sur les anciennes versions. « Comparer… » est désactivé en v1, avec un tooltip.
- 404 : « Contexte introuvable », l'URI, une explication (renommé, supprimé ou hors de votre portée) et un retour à la bibliothèque.

### 5.3 Création / édition
- En-tête : statut d'autosave, Annuler, Enregistrer le brouillon, Publier (désactivé si `canPublish` est faux, avec la raison exposée via `aria-describedby`).
- Formulaire :
  - Titre.
  - Identifiant avec le préfixe `context://`. Généré depuis le titre et la collection, modifiable avant la v1 seulement.
  - Description avec compteur /160.
  - Collection : select avec « + Nouvelle collection… ».
  - Portée : segmented control ; « Projet » fait apparaître un champ repo. Texte d'aide selon la portée.
  - Tags : combobox ARIA multi-valeurs, chips supprimables, suggestions avec compteur, « Créer le tag « x » », navigation ↑↓/Entrée/Échap.
- Éditeur en split :
  - source à gauche : textarea mono, gouttière de numéros de ligne, ligne d'un finding en danger-soft avec une barre danger ;
  - aperçu sanitisé à droite ;
  - barre d'outils et compteurs lignes / ≈ tokens ; scan debouncé.
- Sous l'éditeur :
  - le résultat du scan : alerte bloquante, avec les actions « Remplacer par ${VAR} » et « Faux positif… » ;
  - le champ « Note de version » (requise).
- Conflit de version à l'enregistrement : brouillon conservé en localStorage, avec « Voir les différences » et « Repartir de la vN ».
- Garde de navigation si des modifications ne sont pas enregistrées.

### 5.4 Tags & collections
- Onglets ARIA avec compteurs.
- Tags :
  - bandeau de tags proches (vue / vue3 / vuejs) ;
  - filtre, sélection multiple (Fusionner / Supprimer) ;
  - tableau : case · tag · contextes · publiés · dernier usage · actions (Renommer inline, Fusionner, Supprimer), badge « Inutilisé » à 0 ;
  - un renommage vers un nom existant affiche l'avertissement de fusion.
- Collections : nom · description · contextes · publiés · actions, plus « Nouvelle collection ».
- Dialog de fusion : impact chiffré (contextes concernés, doublons évités, aucune version créée, URI inchangées).
- Alertdialog de suppression : impact chiffré, collection cible obligatoire, option « Ajouter le tag {ancien-nom} », bouton danger.
- Utiliser l'élément natif `<dialog>` (focus trap, Échap, retour du focus).

## 6. Données de démo

Les textes, compteurs et dates visibles dans les maquettes **sont** les fixtures attendues. Les reprendre tels quels.
Un contexte contient volontairement `NUXT_API_KEY=sk_live_…` pour démontrer le scan.
