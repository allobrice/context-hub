# Context Hub serveur (`apps/server`)

Serveur Node (Hono) : API REST `/api/*` pour l'UI, serveur MCP Streamable HTTP `/mcp` pour les sessions Claude Code, persistance SQLite (Drizzle + better-sqlite3). Règles communes : `CLAUDE.md` racine.

> Construit par phases : 2 (persistance), 3 (REST), 4 (MCP) et 7 (Workspaces). Connexion des clients MCP : `README.md`.

## Commandes

Depuis `apps/server` (ou `pnpm --filter @context-hub/server <script>` depuis la racine) :

| Commande              | Rôle                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`            | Serveur en watch (`tsx watch`), lit `.env.local` s'il existe (voir `.env.example`)       |
| `pnpm start`          | Serveur sans watch                                                                       |
| `pnpm openapi:export` | Réécrit `openapi.json` (contrat commité, source des types du front)                      |
| `pnpm typecheck`      | `tsc` sur `src` (`tsconfig.app.json`) et l'outillage (`tsconfig.node.json`)              |
| `pnpm lint`           | ESLint (config racine)                                                                   |
| `pnpm test`           | Vitest : bases SQLite en mémoire, seedées                                                |
| `pnpm db:generate`    | `drizzle-kit generate` : migration SQL depuis `schema.ts`, à commiter dans `drizzle/`    |
| `pnpm db:migrate`     | Applique les migrations à la base (`CONTEXT_HUB_DB_PATH`, défaut `data/context-hub.db`)  |
| `pnpm db:seed`        | Migre puis seede une base **vide** ; affiche le jeton de dev une seule fois              |
| `pnpm db:init`        | Migre puis prépare une base **vide** (utilisateur, jeton, collection système), sans démo |

Le code est exécuté par `tsx` (pas d'étape de build) : le domaine partagé est consommé en sources TS.

## Arborescence

```
src/
  main.ts           # démarrage : config, base migrée, composition, écoute 127.0.0.1
  composition.ts    # câblage unique (stores → cas d'usage → app Hono), partagé par main, CLI et tests
  cli/              # exportOpenApi.ts
  application/      # cas d'usage (ContextService, TaxonomyService, OverviewService (sidebar), workspaces/WorkspaceService,
                    # AuthService, mcp/ContextCatalog), ports (ContextStore, TaxonomyStore, WorkspaceStore, UserStore,
                    # McpReadLog, ContextEvents, WorkspaceEvents, Clock, Logger), Viewer ; sans Hono ni Drizzle
  interfaces/http/  # app.ts (middlewares, routes, OpenAPI), routes/*, schemas.ts (transport), errors.ts, middleware/
  interfaces/mcp/   # mountMcp.ts (aiguillage 2025 / 2026-07-28), legacySessions.ts, contextHubServer.ts (surface MCP),
                    # workspaceSurface.ts (outils workspace_*, propose_context, workspace://{slug})
  infrastructure/config/ # env.ts : configuration validée par Zod
  infrastructure/logging/ # logger JSON
  infrastructure/db/
    schema.ts       # schéma Drizzle portable (text/integer, dates ISO UTC)
    connection.ts   # openDatabase : pragmas (foreign_keys, WAL) + migrations
    search/         # ContextSearchIndex (interface) + Fts5SearchIndex : SEUL SQL propre à SQLite
    stores/         # Drizzle*Store : implémentations des ports
    seed/           # seedDemoData : fixtures du domaine + jeton de dev
    cli/            # migrate.ts, seed.ts
  test/             # support de test : base en mémoire seedée (createTestDatabase), app complète (createTestApp),
                    # ManualClock, workspaceWorker.ts (tests de concurrence en worker_threads)
drizzle/            # migrations : 0000 générée, 0001 custom (FTS5 + trigger d'immuabilité), 0004 workspaces
tests/architecture/ # garde-fous : couches, dépendances, immuabilité des versions
```

## Règle de couches

`interfaces/http` et `interfaces/mcp` → `application` → `@context-hub/domain` ; `infrastructure` → `application` → domain. Seuls `main.ts`, `composition.ts` et `cli/` assemblent ; seul `src/test/` assemble l'infrastructure pour les tests. Appliquée par `eslint-plugin-boundaries` (éléments `server-*` de l'`eslint.config.js` racine), vérifiée par `tests/architecture/layers.test.ts`.

## Persistance : règles

- **Portabilité Postgres** : pas de SQL spécifique hors `search/Fts5SearchIndex.ts` et de la migration custom `0001`. Dates en ISO 8601 UTC (`dates.ts` : `isoDate`, `toUtcIso`) : triables lexicographiquement.
- **Versions immuables** : `context_versions` n'est jamais mis à jour ni supprimé (insert seulement). Triggers `BEFORE UPDATE` et `BEFORE DELETE … RAISE(ABORT)` en défense en profondeur ; `immutable-versions.test.ts` le vérifie.
- **Métadonnées publiées séparées** : `contexts.published_*` (titre, description, collection, portée, tags JSON) ne sont écrites qu'à la **publication**, après le scan ; les colonnes courantes portent le brouillon (UI). MCP (`listPublished`, `findPublished`, `searchPublished`, colonne FTS `published_text`) ne lit **que** les métadonnées publiées et applique la portée publiée. La taxonomie (renommer, fusionner, supprimer) met à jour les deux.
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

## Serveur MCP : règles

- SDK v2 (`@modelcontextprotocol/server` + `@modelcontextprotocol/hono`). `/mcp` est monté dans la même app Hono, derrière `hostHeaderValidation` / `originValidation` du SDK (DNS rebinding ; `CONTEXT_HUB_ALLOWED_HOSTS`), une limite de corps de 1 Mo et le **même** middleware Bearer que l'API.
- **Topologie hybride** (pattern `isLegacyRequest` du SDK) : `createMcpHandler` n'a pas de sessions. Les clients 2025 (défaut du client v2) passent donc par `LegacySessions` (`WebStandardStreamableHTTPServerTransport` avec `Mcp-Session-Id`, flux GET pour les notifications), et les clients 2026-07-28 par `createMcpHandler({ legacy: 'reject' })` (`subscriptions/listen`). Une seule factory (`createContextHubMcpServer`) sert les deux.
- Une session legacy est liée à l'utilisateur qui l'a ouverte : un autre jeton sur le même `Mcp-Session-Id` reçoit 404. Plafond de `MAX_LEGACY_SESSIONS`.
- `notifications/resources/list_changed` : `ContextService` émet sur `ContextEvents` à chaque publication, archivage ou désarchivage ; `mountMcp` relaie vers les sessions et vers `handler.notify.resourcesChanged()`. Le bus est en mémoire du processus (une seule instance).
- Templates : `context://{+slug}@{version}` **enregistré avant** `context://{+slug}` (le SDK essaie les templates dans l'ordre ; `{+slug}` accepte les « / », `{slug}` non).
- `ContextCatalog` : seuls les contextes `published` sont servis (jamais un brouillon ni un archivé), versions figées prises dans l'historique publié, portées du `viewer`, chaque lecture écrite dans `mcp_reads`. `search_contexts` ne renvoie jamais le contenu et ne cherche que dans le contenu publié.
- `X-Context-Hub-Repo` : **filtre de pertinence, pas une frontière de sécurité** (projets du repo en tête, autres repos exclus de `search_contexts`).
- Le contenu est une donnée : renvoyé en `text/markdown` (ressource embarquée pour `get_context`), et les descriptions des outils le rappellent. Journal MCP : méthode, URI, outil, nombre de résultats, utilisateur ; jamais le contenu.

## Règles de sécurité ajoutées par l'audit (phase 6)

- Seul l'**auteur** d'un contexte peut le passer en portée `personal` (`personal-scope-forbidden`) : sinon un membre pourrait s'approprier un contexte d'équipe.
- À la publication, le titre, la description, la note et les tags sont **scannés** aussi (`secret-in-metadata`) ; un faux positif ne vaut que pour le contenu. Le contenu n'est scanné qu'une fois (`reviewPublication`).
- `publish` vérifie dans la transaction que le brouillon publié est celui qui a été relu et scanné (`expectedDraftUpdatedAt`) : sinon 409, jamais d'écrasement silencieux.
- Mutations `/api/*` avec un `Origin` autre que le front : 403 `FORBIDDEN_ORIGIN` (CSRF via le proxy de dev, qui ajoute le jeton). Les clients sans `Origin` passent.
- Collection inconnue : 422 `TAXONOMY_RULE` (`unknown-collection`), pas une erreur de clé étrangère.
- Sessions MCP 2025 : 20 par utilisateur au plus (429), 500 au total (503).
- Scan : répétitions bornées dans les règles d'instructions suspectes (pas de ReDoS) ; jetons `chub_` détectés. Tests de non-régression : `src/interfaces/http/security.test.ts`.

## Workspaces (phase 7, SPEC §7)

Ne pas confondre : `OverviewService` / `GET /api/workspace` (singulier) = navigation de la sidebar ; `WorkspaceService` / `/api/workspaces/*` = espaces de travail en direct.

- **Accès** : seuls les membres (`workspace_members` : créateur + invités). Non-membre : 403 `WORKSPACE_FORBIDDEN` ; slug inconnu : 404. Tout membre peut inviter, libérer de force et fermer.
- **Fermé** : lecture seule ; toute écriture (entrée, claim, join, heartbeat, invitation) : 410 `WORKSPACE_CLOSED`. `check-write` reste permis (plus aucun claim).
- **`seq` sans trou** : attribué depuis `workspaces.next_seq` dans une transaction **IMMEDIATE** (`{ behavior: 'immediate' }`), jamais de `MAX(seq) + 1`. Postgres : `SELECT … FOR UPDATE` sur la ligne `workspaces`.
- **Claims atomiques** : purge des expirés (une entrée `system/claim` chacun), vérification du chevauchement (`claimsOverlap`, règle conservatrice) et insertion dans une même transaction IMMEDIATE. Une session qui reprend exactement sa zone la renouvelle ; elle peut réserver une zone incluse dans la sienne.
- **TTL** : 30 min par défaut, renouvelé par l'activité de la session (entrée postée, heartbeat, claim). Un claim expiré n'est plus opposable même avant sa purge.
- **Scan** : chaque entrée passe par `redactEntry` : secrets **remplacés** (`[secret masqué]`, rien n'est stocké), injection suspecte conservée mais signalée (`suspicious`). Titre ou objectif avec un secret : 422 `secret-in-metadata`.
- **`check-write`** : lecture indexée (`workspace_claims_lookup_idx`) ; en cas de blocage, le serveur journalise lui-même l'entrée `system/hook`, au plus une fois par 5 min par (claim, session), dédupliquée en mémoire du processus.
- **Résumé et delta** : `buildDigest` / `buildDelta` du domaine, plafonnés en tokens ; entrées attribuées, corps cités ligne à ligne (`│ `) : un corps ne peut pas imiter un en-tête.
- **Maintenance** : `main.ts` appelle `closeIdleWorkspaces()` au démarrage puis toutes les heures (fermeture à 30 j sans activité, purge des claims expirés).
- **Notifications** : `WorkspaceEvents` → `LegacySessions.notifyWorkspaceUpdated` (sessions 2025 membres et abonnées à `workspace://{slug}`). Le bus 2026 n'est pas utilisé (pas de contrôle d'appartenance, voir ROADMAP).
- **Journal** : outil, slug, résultat, utilisateur ; jamais le corps d'une entrée (testé).
- **Tests de concurrence** : `DrizzleWorkspaceStore.concurrency.test.ts` lance des `worker_threads` (`--import tsx`), une connexion SQLite chacun sur un fichier WAL, libérés ensemble par une barrière `Atomics`. Dans un seul thread, better-sqlite3 étant synchrone, des appels « concurrents » seraient sérialisés et ne prouveraient rien. Les mêmes scénarios passent aussi par REST et par le client MCP.
- **Seed** : `seedWorkspaces` (fixtures des maquettes 23 à 30), dates décalées de `DEMO_NOW` vers le « maintenant » du seed.
