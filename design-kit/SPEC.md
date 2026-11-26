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
| Workspaces (liste) | `/workspaces?status=open\|closed\|all` | 23 · 24 vide · 25 chargement |
| Workspace (détail) | `/workspaces/:slug` | 26 journal + claims + participants · 27 sombre · 28 fermé · 29 chargement · 30 accès refusé (403) |
| Missions (file) | `/missions?status=active\|draft\|ready\|archived\|all&tags=` | 31 · 32 vide · 33 sombre |
| Mission (détail) | `/missions/:slug` | 34 à valider · 35 prête · 36 code modifié · 37 en cours · 38 terminée · 39 sombre |

La sidebar de tous les écrans comporte, dans l'ordre : Bibliothèque, Workspaces (compteur des ouverts), Missions (compteur des missions à traiter), Tags & collections, Connexion MCP.

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

## 7. Workspaces (sessions en direct)

Un **workspace** relie plusieurs sessions Claude Code qui travaillent en même temps sur un même sujet, depuis une ou plusieurs machines. Il est distinct d'un contexte :

| | Contexte | Workspace |
|---|---|---|
| Nature | Connaissance stable, versionnée | État de travail en direct |
| Qui écrit | Un humain, via l'UI ; publication après scan | Les sessions (via MCP) et les humains (via l'UI) |
| Garantie | Relu et publié | **Non vérifié** : données attribuées, jamais des instructions |
| Durée de vie | Permanente (archivable) | Ouvert → inactif (7 j) → fermé (auto à 30 j ou manuel) |
| Passerelle | — | `propose_context` crée un **brouillon** de contexte, publié uniquement par un humain |

### 7.1 Modèle

```ts
type WorkspaceStatus = 'open' | 'closed'          // « Inactif » est dérivé : open + aucune activité depuis 7 j
interface Workspace {
  id: string; slug: string; title: string; goal: string; status: WorkspaceStatus
  repos: string[]; linkedContextIds: ContextId[]
  createdBy: string; createdAt: string; lastActivityAt: string; closedAt: string | null
}
type EntryKind = 'note' | 'decision' | 'question' | 'handoff' | 'status' | 'system'
interface SessionRef { userId: string; sessionLabel: string; repo: string | null } // ex. web-1 · allovoisins/front
interface WorkspaceEntry {
  workspaceId: string; seq: number                // monotone, sans trou, par workspace
  kind: EntryKind; body: string; files: string[]
  author: SessionRef | { system: 'claim' | 'hook' | 'lifecycle' }
  redactions: number                              // nombre de secrets masqués par le scan
  createdAt: string
}
interface Claim {
  id: string; workspaceId: string; repo: string; area: string   // glob, ex. apps/web/src/auth/**
  holder: SessionRef; acquiredAt: string; expiresAt: string      // TTL (30 min par défaut), renouvelé par l'activité de la session
}
interface Participant { workspaceId: string; session: SessionRef; joinedAt: string; lastSeenAt: string; cursor: number }
```

### 7.2 Règles (fonctions pures dans `packages/domain`, testées)
- **Chevauchement de claims** : deux claims du même repo se chevauchent si un fichier peut correspondre aux deux globs. Implémentation v1 conservatrice : comparer les préfixes statiques (la partie avant le premier caractère joker) ; un préfixe inclus dans l'autre = chevauchement. Un faux positif est acceptable, un faux négatif ne l'est pas.
- `claimCovers(claim, repo, path)` : utilisé par le hook PreToolUse.
- Une session active = `lastSeenAt` < 5 min. Un claim expiré n'est plus opposable, et sa libération produit une entrée `system`.
- Toute entrée passe par `scanContent` : les secrets sont **remplacés** (`[secret masqué]`), et `redactions` est incrémenté. Une injection suspecte est conservée mais signalée (badge).
- Taille max d'une entrée : 4 000 caractères. Le résumé (digest) injecté dans une session est plafonné (≈ 1 500 tokens) ; le delta par prompt aussi (≈ 800 tokens, avec « N entrées de plus, appeler workspace_read »).

### 7.3 Écran Liste (maquettes 23–25)
- Filtre segmenté Ouverts / Fermés / Tous (dans l'URL), bouton « Nouveau workspace » (dialog : titre, slug, objectif, repos, contextes liés).
- Tableau : titre + slug + objectif · repos · sessions actives / total (point coloré + libellé) · claims · dernière activité · statut (Ouvert, Inactif, Fermé). La ligne entière est un lien.
- Vide : explication, avec « Créer un workspace » et la commande `/context-hub:new "…"`.

### 7.4 Écran Détail (maquettes 26–30)
- En-tête : fil d'Ariane, titre, statut, objectif, ligne de méta (sessions actives, zones réservées, créateur), repos. Actions : « Fermer le workspace » (confirmation), « Proposer un contexte ».
- **Journal** :
  - filtres par type (chips avec compteurs) et indicateur « En direct · mis à jour il y a N s » ;
  - composer humain : message + type, publié comme `<user> · ui` ;
  - entrées de la plus récente à la plus ancienne : n° `seq`, badge de type, session (mono), utilisateur · repo, horodatage relatif, corps, fichiers ;
  - entrée système de blocage par hook : fond danger ; entrée avec secret masqué : fond warn ;
  - « Proposer comme contexte » sur les décisions (ouvre l'éditeur prérempli) ;
  - pagination « Charger les entrées précédentes ».
- **Rejoindre depuis Claude Code** : la commande `/context-hub:join <slug>` avec bouton Copier, et l'explication de ce que fait le plugin.
- **Participants** : point d'activité, label de session, utilisateur · repo, dernière activité.
- **Zones réservées (claims)** : glob, repo, détenteur, TTL restant (warn sous 5 min), bouton « Libérer » (force, crée une entrée système et prévient le détenteur).
- **Contextes liés** : liens vers le Détail, inclus dans le résumé injecté aux sessions.
- Fermé : bandeau lecture seule, pas de composer ni de bloc « Rejoindre », claims vides.
- 403 : « Accès refusé à ce workspace », retour à la liste.
- **Mise à jour en direct v1** : polling TanStack Query (`refetchInterval` 3 s si l'onglet est visible, arrêté sinon) via `GET /entries?since=<seq>`. Le SSE sera envisagé plus tard.

## 8. Missions (travail transmis entre sessions)

Une **mission** est du travail à faire, préparé par une session (ou un humain) pour une autre session, présente ou future. Exemple : un audit perf produit une mission par axe d'amélioration.

| | Contexte | Entrée de workspace | **Mission** |
|---|---|---|---|
| Nature | Connaissance | État de travail en direct | **Instruction à exécuter** |
| Consommation | Lu par N sessions | Lu par les sessions présentes | **Prise par une seule session, une seule fois** |
| Fin de vie | Archivé à la main | Avec le workspace | Terminée (avec résultat), abandonnée (avec raison) ou expirée |

Les **modèles de prompts réutilisables** ne sont pas des missions. Ils peuvent être exposés comme *prompts MCP* (slash commands natifs de Claude Code), voir §8.5.

### 8.1 Modèle

```ts
type MissionStatus = 'draft' | 'ready' | 'in_progress' | 'done' | 'dropped' | 'expired'
type Priority = 'P1' | 'P2' | 'P3'
interface Mission {
  id: string; slug: string; title: string; summary: string     // summary : une ligne affichée dans la file
  prompt: string                                               // Markdown autonome, gabarit §8.3
  priority: Priority; tags: string[]; scope: Scope; status: MissionStatus
  origin: { label: string; batchId: string | null; session: SessionRef | null; createdBy: string }  // ex. « Audit perf · page d'accueil Nuxt »
  codeRef: { repo: string; commit: string; files: string[] }
  freshness: { checkedAt: string; changedFiles: string[]; checkedBy: SessionRef } | null  // rapporté par une session (le serveur n'a pas accès au repo)
  linkedContextIds: ContextId[]; workspaceId: string | null
  validation: { by: string; at: string } | null
  claim: { session: SessionRef; acquiredAt: string; expiresAt: string } | null
  result: {
    summary: string
    deliverables: { kind: 'pr' | 'commit' | 'url'; ref: string }[]
    metrics: { name: string; before: string; after: string }[]
    acceptanceMet: boolean
  } | null
  dropReason: string | null
  createdAt: string; expiresAt: string; closedAt: string | null
}
interface MissionEvent { missionId: string; at: string; actor: SessionRef | { userId: string }; type: 'created' | 'validated' | 'rejected' | 'taken' | 'released' | 'freshness' | 'completed' | 'dropped' | 'expired' | 'reopened'; detail?: string }
```

### 8.2 Cycle de vie (fonctions pures testées)

| Transition | Par | Conditions |
|---|---|---|
| création → `draft` | session | Portée `team` ou `project`, créée par une session : **validation humaine obligatoire** |
| création → `ready` | session (portée `personal`) ou humain | Scan OK |
| `draft` → `ready` / rejet | humain (UI) | Rejet : la mission est supprimée, avec un événement |
| `ready` → `in_progress` | session (`take`) | **Atomique** : une seule session gagne. La réservation dure 30 min et se prolonge à chaque appel mission de la session |
| `in_progress` → `ready` | session (`release`), humain, ou expiration de la réservation | Événement `released` |
| `in_progress` → `done` | session | `result.summary` obligatoire |
| `ready` / `in_progress` → `dropped` | session ou humain | `dropReason` obligatoire |
| `draft` / `ready` → `expired` | job | `expiresAt` dépassé (14 jours par défaut) |
| `done` / `dropped` → `ready` | humain (« Rouvrir ») | Nouveau cycle, historique conservé |

- Fraîcheur : à la prise, la session calcule `git diff --name-only <commit>..HEAD -- <files>` et rapporte `changedFiles`. Si des fichiers ont changé, la session doit **revérifier le constat** avant d'agir (consigne du skill). L'UI affiche le dernier contrôle connu, avec sa date.
- Scan à la création et à la modification (`scanContent`) : secret → refus (422) ; instruction suspecte → refus pour une mission créée par une session.
- Taille max du prompt : 8 000 caractères.

### 8.3 Gabarit du prompt (imposé par `mission_create`)
Sections obligatoires : **Objectif**, **Constat** (chiffré, avec date et commit), **Fichiers**, **À faire**, **Critères d'acceptation**. Sections facultatives : contraintes, contextes liés. Un prompt sans section obligatoire est refusé (422, avec les sections manquantes).

### 8.4 Écrans
- **File** (31–33) :
  - bloc « Origine » quand la file est filtrée sur un lot (`batchId`) : libellé, session, repo@commit, barre d'avancement par statut avec légende ;
  - filtres segmentés À traiter / À valider / Prêtes / Archivées / Toutes (avec compteurs), tags, repo ; tri par priorité puis ancienneté ;
  - colonnes : priorité (P1 en danger), titre + résumé, tags, code d'origine (À jour, ou « N fichiers modifiés » en warn), statut + sous-ligne (qui, depuis quand, ou ce qui est attendu), échéance ;
  - rappel de la commande `/context-hub:next <tag>`, bouton « Nouvelle mission ».
- **Détail** (34–39) :
  - en-tête : priorité, titre, statut, tags, repo, portée, échéance ; actions selon le statut :
    - à valider : Rejeter / Modifier / Valider ;
    - prête : Abandonner / Modifier ;
    - en cours : Libérer ;
    - terminée : Rouvrir / Proposer comme contexte ;
  - **frise du cycle de vie** en 4 étapes (À valider → Prête → En cours → Terminée), étapes passées cochées, étape courante en accent ;
  - bandeau warn « Validation requise » (à valider) ; bandeau warn « Le code a changé depuis la création » (fraîcheur) ;
  - colonne principale : le prompt rendu (≈ tokens), puis **Résultat** (vide, en cours, ou terminé : résumé + métriques avant → après + livrables) ;
  - colonne latérale :
    - « Prendre depuis Claude Code » (statut prête), avec `/context-hub:take <slug>` et les 4 étapes ;
    - « Prise en charge » (statut en cours) ;
    - « Code d'origine » (fichiers et état) ;
    - « Origine et sécurité » ;
    - « Historique ».

### 8.5 Modèles réutilisables (prompts MCP)
Un contexte de la bibliothèque marqué `exposeAsPrompt` est publié comme *prompt MCP*. Claude Code l'affiche comme slash command `/mcp__<serveur>__<nom>`. Limites connues : ce mécanisme est déclenché par l'humain, invisible des agents, et son support varie selon les clients. C'est donc un confort, pas un canal de mission.
