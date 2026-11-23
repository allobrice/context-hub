# Context Hub serveur (`apps/server`)

Serveur Node (Hono) : API REST `/api/*` pour l'UI, serveur MCP Streamable HTTP `/mcp` pour les sessions Claude Code, persistance SQLite (Drizzle + better-sqlite3). Règles communes : `CLAUDE.md` racine.

> Construit par phases : 2 (persistance, fait), 3 (REST), 4 (MCP). Ce fichier est complété à chaque phase.

## Commandes

Depuis `apps/server` (ou `pnpm --filter @context-hub/server <script>` depuis la racine) :

| Commande           | Rôle                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `pnpm typecheck`   | `tsc` sur `src` (`tsconfig.app.json`) et l'outillage (`tsconfig.node.json`)             |
| `pnpm lint`        | ESLint (config racine)                                                                  |
| `pnpm test`        | Vitest : bases SQLite en mémoire, seedées                                               |
| `pnpm db:generate` | `drizzle-kit generate` : migration SQL depuis `schema.ts`, à commiter dans `drizzle/`   |
| `pnpm db:migrate`  | Applique les migrations à la base (`CONTEXT_HUB_DB_PATH`, défaut `data/context-hub.db`) |
| `pnpm db:seed`     | Migre puis seede une base **vide** ; affiche le jeton de dev une seule fois             |

Le code est exécuté par `tsx` (pas d'étape de build) : le domaine partagé est consommé en sources TS.

## Arborescence

```
src/
  application/      # ports (ContextStore, TaxonomyStore, UserStore, McpReadLog, Clock), Viewer, jetons ; sans Hono ni Drizzle
  infrastructure/db/
    schema.ts       # schéma Drizzle portable (text/integer, dates ISO UTC)
    connection.ts   # openDatabase : pragmas (foreign_keys, WAL) + migrations
    search/         # ContextSearchIndex (interface) + Fts5SearchIndex : SEUL SQL propre à SQLite
    stores/         # Drizzle*Store : implémentations des ports
    seed/           # seedDemoData : fixtures du domaine + jeton de dev
    cli/            # migrate.ts, seed.ts
  test/             # support de test : base en mémoire seedée (createTestDatabase)
drizzle/            # migrations : 0000 générée, 0001 custom (FTS5 + trigger d'immuabilité)
tests/architecture/ # garde-fous : couches, dépendances, immuabilité des versions
```

## Règle de couches

`interfaces/http` et `interfaces/mcp` → `application` → `@context-hub/domain` ; `infrastructure` → `application` → domain. Seul `src/main.ts` assemble ; seul `src/test/` assemble l'infrastructure pour les tests. Appliquée par `eslint-plugin-boundaries` (éléments `server-*` de l'`eslint.config.js` racine), vérifiée par `tests/architecture/layers.test.ts`.

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
