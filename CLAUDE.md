# Context Hub UI

UI de gestion de Context Hub : des « contextes » Markdown réutilisables, versionnés et partagés, que les sessions Claude Code lisent via un serveur MCP. Le serveur et l'API n'existent pas encore : l'UI tourne seule sur un adapter in-memory.

## Commandes

| Commande            | Rôle                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run dev`       | Serveur Vite                                                                |
| `npm run build`     | Typecheck puis build de production                                          |
| `npm run typecheck` | `tsc` sur l'app (`tsconfig.app.json`) et l'outillage (`tsconfig.node.json`) |
| `npm run lint`      | ESLint, zéro avertissement toléré                                           |
| `npm run test`      | Vitest (une passe) ; `npm run test:watch` en continu                        |
| `npm run format`    | Prettier                                                                    |

Fin de chaque tâche : `npm run typecheck && npm run lint && npm run test` au vert.

## Référence de design : `design-kit/` (lecture seule)

- `design-kit/SPEC.md` est la **source de vérité** (domaine, design system, écrans, états). En cas d'écart avec une maquette, la SPEC fait foi.
- `design-kit/maquettes/png/` : rendu attendu à 1440 px ; `maquettes/html/` : markup, espacements, libellés et tracés SVG exacts ; `manifest.json` : maquette ↔ écran ↔ état.
- `design-kit/tokens/` : tokens à transcrire dans `src/ui/styles/`.
- Ne jamais modifier `design-kit/`, ni l'importer dans le bundle. Il est exclu de tsconfig, ESLint et Prettier, et le serveur Vite refuse de le servir.

## Arborescence

```
src/
  main.tsx         # point d'assemblage : instancie l'infrastructure et l'injecte dans l'UI
  domain/          # types et règles pures (SPEC §2), aucune dépendance React, tests à côté des sources
  application/     # ports (interfaces) + cas d'usage
  infrastructure/  # InMemory*Repository, fixtures (SPEC §6), latence simulée, ?mock=empty|loading|error|slow|conflict
  ui/
    app/           # router (lazy), providers, layout
    components/    # composants génériques
    features/      # library/ context-detail/ context-editor/ taxonomy/
    styles/        # tokens, thèmes, mixins, reset
  test/            # setup Vitest, helpers de rendu
tests/architecture # garde-fous d'architecture (règle de couches)
```

## Règle de dépendance entre couches

`ui → application → domain` ; `infrastructure → application → domain`. Seul `src/main.tsx` importe à la fois `infrastructure` et `ui`.
Cette règle est appliquée par `eslint-plugin-boundaries` (`LAYER_ELEMENTS` / `LAYER_POLICIES` dans `eslint.config.js`) et vérifiée par `tests/architecture/layers.test.ts`. Ne jamais l'assouplir pour faire passer un import : déplacer le code dans la bonne couche.

## Interdits

- `rehype-raw` et `dangerouslySetInnerHTML` : le contenu d'un contexte est une **donnée non fiable**. Le Markdown passe par `react-markdown` + `remark-gfm` + `rehype-sanitize` (ESLint bloque les deux interdits).
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

### Code

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Exports nommés uniquement. Imports relatifs avec extension `.ts` / `.tsx`.
- Prettier : sans point-virgule, guillemets simples, 100 colonnes.
- Le scan de contenu côté UI (`domain/context/scan.ts`) est indicatif : le serveur fera autorité.

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
