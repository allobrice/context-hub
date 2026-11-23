# Context Hub

Des « contextes » Markdown réutilisables, versionnés et partagés, que les sessions Claude Code lisent via un serveur MCP. Monorepo pnpm : une UI React, un serveur Node (Hono, API REST + MCP) et un domaine partagé.

## Paquets

```
apps/web/          # UI React (Vite) : voir apps/web/CLAUDE.md
apps/server/       # serveur Hono : API REST /api, MCP /mcp, SQLite (voir apps/server/CLAUDE.md)
packages/domain/   # @context-hub/domain : types, schémas, règles pures (SPEC §2), tests à côté des sources
design-kit/        # référence de design, lecture seule (SPEC.md = source de vérité)
```

## Commandes (racine)

| Commande            | Rôle                                                         |
| ------------------- | ------------------------------------------------------------ |
| `pnpm install`      | Dépendances de tout le workspace (pnpm via `packageManager`) |
| `pnpm dev`          | Lance les apps en parallèle                                  |
| `pnpm -r typecheck` | `tsc` de chaque paquet                                       |
| `pnpm -r lint`      | ESLint (config racine unique), zéro avertissement toléré     |
| `pnpm -r test`      | Vitest de chaque paquet                                      |
| `pnpm format`       | Prettier sur tout le dépôt                                   |

Un script d'un seul paquet : `pnpm --filter @context-hub/<paquet> <script>` (ex. `pnpm --filter @context-hub/server db:seed`).
**Fin de chaque tâche : `pnpm -r typecheck && pnpm -r lint && pnpm -r test` au vert.**

## Règle de dépendance entre paquets

- `apps/web` → `packages/domain` ; `apps/server` → `packages/domain`.
- `packages/domain` ne dépend d'aucun paquet du workspace ; sa seule dépendance externe autorisée est `zod`. Ni React, ni Hono, ni Drizzle, ni API Node (`node:*`).
- Une app n'importe jamais une autre app. Le front consomme l'API via le contrat OpenAPI (types générés), jamais le code serveur.
- Toujours importer le domaine par le paquet (`@context-hub/domain/context/types.ts`), jamais par un chemin relatif vers `packages/`.

Appliquée par `no-restricted-imports` et `eslint-plugin-boundaries` dans `eslint.config.js`, vérifiée par `packages/domain/tests/architecture/packages.test.ts`, `apps/web/tests/architecture/packages.test.ts` et `layers.test.ts`. Ne jamais l'assouplir pour faire passer un import : déplacer le code dans le bon paquet.

## Outillage partagé

- `tsconfig.base.json` : TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`…), étendu par chaque paquet. Chaque paquet a un `tsconfig.json` de solution (références) que lit le project service d'ESLint.
- `eslint.config.js` (racine) : une seule config ; ses motifs sont relatifs à la racine, quel que soit le dossier d'où l'on lance `eslint`.
- `.prettierrc.json` : sans point-virgule, guillemets simples, 100 colonnes.
- pnpm refuse les scripts de build non approuvés : `allowBuilds` dans `pnpm-workspace.yaml` (`better-sqlite3` et `esbuild` autorisés).
- Les fixtures de démo (`packages/domain/src/fixtures/`) sont partagées par le front (in-memory) et le seed du serveur.

## Interdits communs

- `any`, assertions non nulles (`!`) et assertions `as` (sauf `as const` et le constructeur d'un type brandé, ex. `toContextId`).
- Exports par défaut : exports nommés uniquement. Imports relatifs avec extension `.ts` / `.tsx`.
- Modifier ou importer `design-kit/`.
- Le contenu d'un contexte est une **donnée non fiable** partout (UI, API, MCP, logs).

Hors périmètre de la v1 : `ROADMAP.md`.
