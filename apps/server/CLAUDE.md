# Context Hub serveur (`apps/server`)

Serveur Node (Hono) : API REST `/api/*` pour l'UI, serveur MCP Streamable HTTP `/mcp` pour les sessions Claude Code, persistance SQLite (Drizzle + better-sqlite3). Règles communes : `CLAUDE.md` racine.

> Construit par phases : 2 (persistance) et 3 (REST) faites, 4 (MCP) à venir.

## Commandes

Depuis `apps/server` (ou `pnpm --filter @context-hub/server <script>` depuis la racine) :

| Commande              | Rôle                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`            | Serveur en watch (`tsx watch`), lit `.env.local` s'il existe (voir `.env.example`)      |
| `pnpm start`          | Serveur sans watch                                                                      |
| `pnpm openapi:export` | Réécrit `openapi.json` (contrat commité, source des types du front)                     |
| `pnpm typecheck`      | `tsc` sur `src` (`tsconfig.app.json`) et l'outillage (`tsconfig.node.json`)             |
| `pnpm lint`           | ESLint (config racine)                                                                  |
| `pnpm test`           | Vitest : bases SQLite en mémoire, seedées                                               |
| `pnpm db:generate`    | `drizzle-kit generate` : migration SQL depuis `schema.ts`, à commiter dans `drizzle/`   |
| `pnpm db:migrate`     | Applique les migrations à la base (`CONTEXT_HUB_DB_PATH`, défaut `data/context-hub.db`) |
| `pnpm db:seed`        | Migre puis seede une base **vide** ; affiche le jeton de dev une seule fois             |

Le code est exécuté par `tsx` (pas d'étape de build) : le domaine partagé est consommé en sources TS.

## Arborescence

```
src/
  main.ts           # démarrage : config, base migrée, composition, écoute 127.0.0.1
  composition.ts    # câblage unique (stores → cas d'usage → app Hono), partagé par main, CLI et tests
  cli/              # exportOpenApi.ts
  application/      # cas d'usage (ContextService, TaxonomyService, WorkspaceService, AuthService),
                    # ports (ContextStore, TaxonomyStore, UserStore, McpReadLog, Clock, Logger), Viewer ; sans Hono ni Drizzle
  interfaces/http/  # app.ts (middlewares, routes, OpenAPI), routes/*, schemas.ts (transport), errors.ts, middleware/
  infrastructure/config/ # env.ts : configuration validée par Zod
  infrastructure/logging/ # logger JSON
  infrastructure/db/
    schema.ts       # schéma Drizzle portable (text/integer, dates ISO UTC)
    connection.ts   # openDatabase : pragmas (foreign_keys, WAL) + migrations
    search/         # ContextSearchIndex (interface) + Fts5SearchIndex : SEUL SQL propre à SQLite
    stores/         # Drizzle*Store : implémentations des ports
    seed/           # seedDemoData : fixtures du domaine + jeton de dev
    cli/            # migrate.ts, seed.ts
  test/             # support de test : base en mémoire seedée (createTestDatabase), app complète (createTestApp)
drizzle/            # migrations : 0000 générée, 0001 custom (FTS5 + trigger d'immuabilité)
tests/architecture/ # garde-fous : couches, dépendances, immuabilité des versions
```

## Règle de couches

`interfaces/http` et `interfaces/mcp` → `application` → `@context-hub/domain` ; `infrastructure` → `application` → domain. Seuls `main.ts`, `composition.ts` et `cli/` assemblent ; seul `src/test/` assemble l'infrastructure pour les tests. Appliquée par `eslint-plugin-boundaries` (éléments `server-*` de l'`eslint.config.js` racine), vérifiée par `tests/architecture/layers.test.ts`.

## Persistance : règles

- **Portabilité Postgres** : pas de SQL spécifique hors `search/Fts5SearchIndex.ts` et de la migration custom `0001`. Dates en ISO 8601 UTC (`dates.ts` : `isoDate`, `toUtcIso`) : triables lexicographiquement.
- **Versions immuables** : `context_versions` n'est jamais mis à jour (insert seulement). Trigger `BEFORE UPDATE … RAISE(ABORT)` en défense en profondeur ; `immutable-versions.test.ts` le vérifie.
- **Un seul brouillon par contexte** : `context_drafts` a `context_id` pour clé primaire.
- **Portées** : `visibleTo(viewer)` sur toutes les lectures. `personal` réservé à son propriétaire (`scope_value` = id utilisateur), `team` et `project` visibles de tout utilisateur authentifié. Un contexte hors portée est introuvable (null, donc 404), pas interdit.
- **Concurrence optimiste** : `saveDraft` et `publish` vérifient `expectedPublishedVersion` dans la transaction de l'écriture et lèvent `VersionConflictError` avec la version publiée entre-temps.
- **Recherche** : FTS5, termes en préfixe, sans accents, tous requis ; chaque terme est quoté (aucun opérateur FTS5 injectable). Scope `published` (MCP) sans le contenu du brouillon. L'index est mis à jour dans la transaction de chaque écriture (`reindex`).
- **Jetons** : `generateApiToken` (`chub_` + 256 bits), seul le sha-256 est stocké (`hashApiToken`). Le jeton n'est affiché qu'une fois, par `db:seed`.
- `mcpReads7d` = nombre de lignes `mcp_reads` des 7 derniers jours (horloge injectée).
- better-sqlite3 est synchrone ; les ports sont asynchrones (portabilité) : `deferred()` convertit, une exception devient un rejet.

## API REST : règles

- Contrat : `@hono/zod-openapi`, servi sur `/api/openapi.json` et commité dans `openapi.json` (`openapi.test.ts` échoue s'il dérive : relancer `pnpm openapi:export`). Les schémas viennent de `@context-hub/domain/schemas/*` (Zod nu, nommés par `.meta({ id })`) ; `interfaces/http/schemas.ts` ne fait que les composer pour le transport (query, params, corps).
- **Erreurs** : format unique `{ code, message, details? }` (`ApiErrorSchema`, union discriminée par `code`). Toute erreur passe par `errors.ts` : `knownErrorResponse` (404, 409 `VERSION_CONFLICT` / `NO_DRAFT`, 422 `DRAFT_REJECTED` / `TAXONOMY_RULE`, 400), `validationHook` (Zod), `notFound`, et un 500 générique qui ne journalise que le nom de l'erreur.
- **Auth** : `Authorization: Bearer <jeton>` sur tout `/api/*` sauf `/api/health` ; le jeton est haché (sha-256) puis cherché en base (`AuthService`). 401 avec `WWW-Authenticate`.
- **Portées** : appliquées par les stores (`visibleTo`) ; hors portée = 404. Une portée `personal` est toujours attribuée à son auteur (`ContextService`).
- Le serveur fait autorité : `ContextService` rejoue `draftRejections` / `publishRejections` et **rescanne le contenu à la publication** (422 avec les findings, sans la valeur des secrets). Les faux positifs ne valent qu'avec un motif et pour un finding réellement présent.
- Les routes d'écriture acceptent un identifiant ou un slug encodé ; le cas d'usage résout la référence puis écrit par identifiant.
- CORS limité à `CONTEXT_HUB_WEB_ORIGIN` ; corps limité à 2 Mo ; journal : une ligne JSON par requête (méthode, motif de route, statut, durée, utilisateur), jamais de corps, query, en-tête ni contenu.
