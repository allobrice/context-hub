# Context Hub UI (`apps/web`)

UI de gestion de Context Hub : des « contextes » Markdown réutilisables, versionnés et partagés, que les sessions Claude Code lisent via un serveur MCP. Règles communes au monorepo (paquets, gate de fin de tâche) : `CLAUDE.md` racine. Deux sources de données, choisies au build par `VITE_DATA_SOURCE` : `memory` (défaut : fixtures, `?mock=*`) ou `http` (API `apps/server`).

## Commandes

Depuis `apps/web` (ou depuis la racine avec `pnpm --filter @context-hub/web <script>`) :

| Commande             | Rôle                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`           | Serveur Vite                                                                          |
| `pnpm build`         | Typecheck puis build de production                                                    |
| `pnpm typecheck`     | `tsc` sur l'app (`tsconfig.app.json`) et l'outillage (`tsconfig.node.json`)           |
| `pnpm lint`          | ESLint (config racine), zéro avertissement toléré                                     |
| `pnpm test`          | Vitest : projet `unit` (jsdom) puis projet `contract` (serveur réel)                  |
| `pnpm test:contract` | Suite de contrat HTTP seule (démarre des serveurs `apps/server` en processus enfants) |
| `pnpm api:generate`  | Régénère `src/infrastructure/http/openapi.d.ts` depuis `apps/server/openapi.json`     |

Formatage : `pnpm format` à la racine. Fin de chaque tâche : la gate du `CLAUDE.md` racine.

## Référence de design : `design-kit/` à la racine (lecture seule)

- `design-kit/SPEC.md` est la **source de vérité** (domaine, design system, écrans, états). En cas d'écart avec une maquette, la SPEC fait foi.
- `design-kit/maquettes/png/` : rendu attendu à 1440 px ; `maquettes/html/` : markup, espacements, libellés et tracés SVG exacts ; `manifest.json` : maquette ↔ écran ↔ état.
- `design-kit/tokens/` : tokens à transcrire dans `src/ui/styles/`.
- Ne jamais modifier `design-kit/`, ni l'importer dans le bundle. Il est exclu de tsconfig, ESLint et Prettier, et le serveur Vite refuse de le servir (`server.fs.deny`).

## Arborescence

```
src/
  main.tsx         # point d'assemblage : instancie l'infrastructure et l'injecte dans l'UI
  application/     # ports (interfaces) + cas d'usage
  infrastructure/  # in-memory/ (InMemory*Repository, ?mock=*), http/ (Http*Repository, client openapi-fetch,
                   # types générés), config/env.ts, createInMemoryServices / createHttpServices
  ui/
    app/           # router (lazy), providers, layout
    components/    # composants génériques
    features/      # library/ context-detail/ context-editor/ taxonomy/ mcp/ workspaces/
    styles/        # tokens, thèmes, mixins, reset
  test/            # setup Vitest, helpers de rendu
tests/architecture # garde-fous : couches, dépendances du paquet, couleurs en dur, types OpenAPI à jour
tests/contract     # suite de contrat contre un vrai serveur (Node : processus enfants)
```

Le domaine (types et règles pures, SPEC §2) est le paquet `packages/domain`, importé par `@context-hub/domain/<chemin>.ts` (ex. `@context-hub/domain/context/types.ts`), jamais par un chemin relatif.

## Règle de dépendance entre couches

`ui → application → domain` ; `infrastructure → application → domain` (`domain` = `packages/domain`). Seul `src/main.tsx` importe à la fois `infrastructure` et `ui`.
Cette règle est appliquée par `eslint-plugin-boundaries` (`LAYER_ELEMENTS` / `LAYER_POLICIES` dans l'`eslint.config.js` racine) et vérifiée par `tests/architecture/layers.test.ts`. Ne jamais l'assouplir pour faire passer un import : déplacer le code dans la bonne couche.
Les fichiers `*.test.ts(x)` peuvent importer `src/test/` ; seul `src/test/` assemble l'infrastructure in-memory pour les tests (`renderApp`, `createTestServices`).

## Données et états simulés

- Ports dans `src/application/ports/` (`ContextRepository`, `TaxonomyRepository`, `OverviewRepository` pour la navigation, `WorkspaceRepository` pour les Workspaces, `Clock`) ; l'UI les reçoit via `useServices()`, jamais en import direct.
- Fixtures dans `packages/domain/src/fixtures/` (partagées avec le seed du serveur) : les textes et compteurs des maquettes **sont** les fixtures. `contexts.test.ts` (à côté) vérifie chaque compteur visible (statuts, collections, portées, tags, fusion) : le mettre à jour avec toute modification des fixtures.
- Horloge figée au 23/11/2026 11:12 (`demoClock`, sur `DEMO_NOW` du domaine) pour que « il y a 2 h », « hier »… correspondent aux maquettes. Les tests tournent en `TZ=Europe/Paris`.
- Le repository in-memory joue le rôle du serveur : il revalide le brouillon (`draftRejections`) et rescanne le contenu à la publication (`publishRejections`) ; l'UI n'est jamais seule juge.
- Copie locale des brouillons (`DraftStorage`, `localStorage` validé par garde de type) : autosave 2 s, conservée sur conflit, effacée après enregistrement serveur.
- `?mock=conflict` : à l'enregistrement d'un contexte publié, « Camille » publie la version suivante juste avant → `VersionConflictError` ; « Repartir de la vN » débloque.
- `?mock=empty|loading|error|slow|conflict` : relu à chaque appel. Il ne touche que la requête **principale** de l'écran ; la navigation (sidebar) reste disponible (maquettes 05 et 06).
- Workspaces : `?mock=ws-empty` (aucun workspace, maquette 24), `ws-closed` (tout workspace présenté fermé, maquette 28), `ws-forbidden` (accès refusé au détail, maquette 30) ; `loading` et `error` s'appliquent à la liste et au détail (maquettes 25, 29). Utilisateur de la démo : Brice (membre des 4 workspaces des fixtures).

## Données réelles (mode `http`)

- `HttpContextRepository`, `HttpTaxonomyRepository`, `HttpOverviewRepository`, `HttpWorkspaceRepository` implémentent les **mêmes ports** que l'in-memory. Client `openapi-fetch` typé par `openapi.d.ts`, **généré** depuis le contrat commité du serveur (`pnpm api:generate`) : jamais d'import du code serveur, jamais de modification à la main. `tests/architecture/openapi-types.test.ts` échoue s'il n'est plus à jour.
- Erreurs d'API → erreurs du domaine dans `http/apiClient.ts` (`unwrap`) : 404 → `ContextNotFoundError`, 409 → `VersionConflictError` (écran de conflit), 422 → `DraftRejectedError` avec les **findings du serveur** (fusionnés au scan local dans l'éditeur, `mergeFindings`), 401 → `UnauthorizedError` (message dédié, sans « Réessayer », `LoadErrorState`), réseau / 5xx → `RepositoryUnavailableError`.
- `VITE_DATA_SOURCE` est comparé **dans `main.tsx`** sur `import.meta.env` : Vite remplace la valeur au build et la branche inutilisée sort du bundle (les fixtures en mode http, le client HTTP en mode memory). Le domaine est `sideEffects: false` pour la même raison.
- Dev : `pnpm dev` à la racine lance serveur et front. Le proxy Vite envoie `/api` vers `CONTEXT_HUB_API_TARGET` (défaut `http://127.0.0.1:8787`) et **injecte le jeton côté Node** (`CONTEXT_HUB_DEV_TOKEN`, sans préfixe `VITE_`, dans `.env.local`) : il n'entre jamais dans le bundle ni dans le navigateur. Voir `.env.example`.
- `VITE_MCP_URL` : URL du serveur MCP du bloc « Utiliser dans Claude Code » (absente : `https://[HÔTE]/mcp`).
- **Suite de contrat unique** (`src/test/contract/servicesContract.ts`) : mêmes scénarios contre l'in-memory (`inMemory.contract.test.ts`, projet `unit`) et contre l'adapter HTTP sur un vrai serveur seedé neuf à chaque test (`tests/contract/http.contract.test.ts`, projet `contract`, lancé après `unit` pour ne pas disputer le CPU aux tests d'UI). Toute évolution d'un port s'y teste pour les deux adapters.

## Routes

`/` Bibliothèque · `/contexts/new` (`?title=&description=&content=` : préremplissage, « Proposer comme contexte ») · `/contexts/:id` · `/contexts/:id/edit` · `/taxonomy?tab=tags|collections` · `/workspaces?status=open|closed|all` · `/workspaces/:slug` · `/mcp` · `/__components` (dev uniquement). Tous les écrans de la SPEC sont implémentés.
Taxonomie : renommer vers un nom existant = fusionner ; l'impact d'une fusion est calculé par le repository (`previewTagMerge`) ; toute mutation de taxonomie invalide les caches `taxonomy`, `contexts` et la navigation. Chemins centralisés dans `src/ui/app/paths.ts`, routes lazy dans `src/ui/app/routes.tsx`.
`/contexts/:id` accepte un identifiant ou un slug encodé (`nuxt%2Fconventions-nuxt-4`) ; une référence inconnue donne la 404 de la maquette 11.
La Bibliothèque garde recherche, filtres, tri, page et vue dans l'URL (`libraryParams.ts`) ; les paramètres inconnus (`mock`) sont conservés.

## Interdits

- `rehype-raw` et `dangerouslySetInnerHTML` : le contenu d'un contexte est une **donnée non fiable**. Le Markdown passe par `react-markdown` + `remark-gfm` + `rehype-sanitize` (ESLint bloque les deux interdits).
- Rendu Markdown ailleurs que par `MarkdownView` (`src/ui/components/Markdown/`) : HTML brut ignoré (`skipHtml`), arbre assaini, titres décalés d'un niveau, images distantes jamais chargées (exfiltration possible par URL), liens `noopener noreferrer`, secrets masqués.
- Couleurs en dur hors tokens : toute couleur passe par une custom property de `src/ui/styles/` (`var(--…)`).
- Le jeton MCP n'est jamais lu ni affiché par l'UI : la config affichée référence `$CONTEXT_HUB_TOKEN`.
- Pas de lib de composants UI, pas de Tailwind, pas d'emoji dans l'UI (icônes SVG inline).
- `any`, assertions non nulles (`!`) et assertions `as` (sauf `as const` et le constructeur d'un type brandé, ex. `toContextId`).

## Conventions

### Styles

- SCSS Modules par composant (`Composant.module.scss`), classes en camelCase, nesting ≤ 3 niveaux, `@use` uniquement.
- Chaque module commence par `@use 'abstracts' as *;` (résolu via `css.preprocessorOptions.scss.loadPaths`) : mixins `focus-ring`, `control`, `panel`, `truncate`, `mono`, `visually-hidden`, `reset-button`, `stack-below`.
- Couleurs, rayons, tailles de texte et hauteurs de contrôle : toujours `var(--…)`. Les couleurs littérales n'existent que dans `src/ui/styles/base/_tokens.scss` (vérifié par `tests/architecture/no-hardcoded-colors.test.ts`).
- Les espacements hors échelle des maquettes (6, 10, 14, 18 px) restent en px pour reproduire les maquettes au pixel.
- Thème : `ThemeProvider` (`src/ui/app/theme/`) pilote `<html data-theme>` ; même clé localStorage que le script inline d'`index.html`.
- Polices : sous-ensemble `latin` de `@fontsource` uniquement (`src/ui/styles/index.ts`).

### Composants

- Génériques dans `src/ui/components/<Nom>/` : `Button`/`ButtonLink`, `IconButton`, `Icon` (tracés des maquettes dans `icons.ts`), `Badge`, `StatusBadge`, `Tag`, `Segmented` (radiogroup), `Tabs`/`TabPanel`, `Dialog` (`<dialog>` natif), `Menu`, `Tooltip`, `Field`/`TextInput`/`Select`, `CopyField`, `Skeleton`, `EmptyState`, `ErrorState`, `VisuallyHidden`.
- Navigation clavier itinérante : `rovingIndex` (`src/ui/lib/`). Bouton indisponible avec info-bulle : `aria-disabled`, pas `disabled`.
- Avec `exactOptionalPropertyTypes`, une prop qui reçoit une classe de module se type `className?: string | undefined`.
- Galerie de développement : `src/ui/app/dev/ComponentGallery.tsx`.

### Performance (audit phase 7)

- CLS : un en-tête dont le contenu change au chargement ne doit pas passer à la ligne (`flex-wrap: nowrap` en desktop, contenus compressibles) ; `scrollbar-gutter: stable` sur `html`. Mesurer avec un `PerformanceObserver('layout-shift')` sur le build (`pnpm build && pnpm preview`), pas en dev.
- Ne pas mémoïser sans mesure : une mémoïsation de la gouttière de l'Éditeur n'apportait rien (12,5 ms par frappe à 400 lignes avec ou sans) et a été retirée.
- Le parser Markdown doit rester hors du bundle principal (chunk partagé Détail / Éditeur).

### Workspaces (phase 9, SPEC §7)

- Journal : une première page (`before`, les 20 plus récentes), **jamais rechargée en entier** ; puis un polling `since=<prochain seq>` (`refetchInterval` 3 s, `refetchIntervalInBackground: false` : arrêté onglet masqué, et pour un workspace fermé) qui **fusionne** les entrées dans le cache (`journal.ts`, `mergeEntries` : par `seq`, sans doublon). « Charger les entrées précédentes » fusionne de même. Intervalle configurable (`AppConfig.workspacePollMs`, court en test).
- La page ne doit pas lire `data` / `dataUpdatedAt` de la requête de polling : ils changent à chaque passage et re-rendaient toute la page toutes les 3 s (mesuré : 13 rendus en 400 ms, contre 1). L'heure de synchronisation est lue par `useLastSync` dans l'indicateur « En direct », qui se re-rend seul chaque seconde ; les heures relatives du journal, toutes les 30 s.
- Le corps d'une entrée est une **donnée non fiable** écrite par une session : rendu en texte brut (`white-space: pre-wrap`), jamais en Markdown ; « Proposer comme contexte » ne fait que préremplir l'éditeur (brouillon, publié par un humain après scan).
- Une nouvelle entrée reçue invalide le détail (claims, participants, compteurs) ; sinon le détail est rafraîchi toutes les 30 s.

### Erreurs

- `technicalCode(error)` pour le code mono d'une erreur de stockage ; `failureOf(mutation.error)` pour le message d'échec d'une mutation, affiché dans le dialog qui l'a déclenchée (`ConfirmDialog error`).

### Code

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Exports nommés uniquement. Imports relatifs avec extension `.ts` / `.tsx`.
- Prettier : sans point-virgule, guillemets simples, 100 colonnes.
- Le scan de contenu côté UI (`@context-hub/domain/context/scan.ts`) est indicatif : le serveur fait autorité (422 avec ses findings).

## Décisions validées (phase 0)

- Pagination de la bibliothèque : 25 lignes par page (SPEC), soit 42 contextes de fixtures cohérents avec tous les compteurs.
- Collections et portées dans la sidebar uniquement sur la Bibliothèque ; ce sont des liens de filtre.
- « Connexion MCP » : route `/mcp` minimale (bloc de configuration CLI / `.mcp.json`).
- Tags : les 34 sans pagination, avec un filtre.
- Secrets : texte réel dans l'éditeur source, masqué dans l'alerte de scan et l'aperçu.
- « Faux positif… » : dialog avec motif obligatoire ; ignore le finding pour ce brouillon (`activeFindings`).
- « Restaurer vN » : copie vN dans le brouillon après confirmation, sans publier.
- Menu « … » du Détail : « Copier l'URI » et, pour un contexte archivé, « Désarchiver ».
- Autosave du brouillon en localStorage après 2 s ; « Enregistrer le brouillon » appelle le repository (où `?mock=conflict` déclenche le conflit).
- « Comparer… » désactivé avec tooltip (SPEC).
- Mutations du mock en mémoire seulement ; brouillon et thème persistés.
