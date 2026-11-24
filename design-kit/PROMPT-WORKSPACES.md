# Prompt Claude Code — Workspaces (phases 7, 8, 9)

À coller dans Claude Code, en plan mode, à la racine du monorepo Context Hub, après avoir remplacé `design-kit/` par cette version du kit.

---

# Mission
Ajouter à Context Hub les **Workspaces** : des espaces de travail en direct, partagés entre plusieurs sessions Claude Code indépendantes (une ou plusieurs machines) qui travaillent sur un même sujet. Une session y lit et écrit un journal (notes, décisions, questions, passations, statuts) et réserve les zones du code qu'elle modifie (claims).
- Phase 7 : serveur (persistance, cas d'usage, REST, MCP) + tests de concurrence.
- Phase 8 : plugin Claude Code `context-hub` (config MCP, hooks, skill, commandes) + test avec 2 ou 3 vraies sessions.
- Phase 9 : écrans Workspaces dans `apps/web`.
L'existant (bibliothèque, REST, MCP, UI) ne doit pas régresser : tous les tests restent verts à chaque phase.

# Références
- `design-kit/SPEC.md` **§7** : modèle, règles, écrans. Source de vérité.
- `design-kit/maquettes/png/23…30-*.png` et `maquettes/html/` : rendu attendu des écrans Workspaces. La sidebar de tous les écrans a une nouvelle entrée « Workspaces ».
- `CLAUDE.md` et l'architecture actuelle (`packages/domain`, `apps/server`, `apps/web`).
- Doc Claude Code (plugins, hooks, slash commands, MCP) : https://code.claude.com/docs. **Vérifie chaque point d'API dans la doc actuelle avant de l'utiliser.**

# Mode de travail
1. **Plan mode d'abord.** Rien n'est modifié avant que j'aie validé ton plan.
2. Une phase à la fois. En fin de phase : `pnpm -r typecheck && pnpm -r lint && pnpm -r test` au vert, résumé de 5 lignes maximum, puis **stop**. **Ne passe pas à la phase suivante sans mon accord explicite.**
3. Vérifie les versions (`npm view`) et les API (doc, ou types installés) au lieu de te fier à ta mémoire.
4. Si une contrainte est impossible avec l'API réelle (SDK MCP, hooks Claude Code), arrête-toi et propose une alternative.

# Skills (plugin frontend-toolkit)
| Skill | Quand |
|---|---|
| `frontend-toolkit:auditing-architecture` | Plan (phase 7), puis audit en fin de phase 9 |
| `frontend-toolkit:developing-typescript` | Phases 7 à 9 : types du domaine, unions discriminées (`EntryKind`, erreurs), schémas Zod |
| `frontend-toolkit:writing-clean-code` | En continu, et en revue des fichiers modifiés à chaque fin de phase |
| `frontend-toolkit:developing-scss` | Phase 9 (écrans Workspaces, tokens existants uniquement) |
| `frontend-toolkit:auditing-performance` | Fin de phase 9 : polling, rendu du journal, taille du bundle |

# Phase 7 — Serveur

## Domaine (`packages/domain`)
- Types et schémas Zod de SPEC.md §7.1.
- Fonctions pures testées : `claimsOverlap(a, b)` (règle conservatrice de §7.2, tests exhaustifs sur les globs), `claimCovers(claim, repo, path)`, `isSessionActive`, `deriveWorkspaceStatus` (Ouvert / Inactif / Fermé), `redactEntry` (via `scanContent`), `truncateDigest(entries, budgetTokens)`.

## Persistance (Drizzle, SQLite, portable Postgres)
- Tables : `workspaces`, `workspace_entries` (PK `(workspace_id, seq)`), `workspace_claims`, `workspace_participants`, `workspace_members` (qui a accès : créateur + invités).
- **`seq` monotone sans trou** : il est attribué dans la même transaction que l'insert, à partir d'un compteur `next_seq` sur `workspaces`, verrouillé (transaction `IMMEDIATE` en SQLite). Aucun `MAX(seq)+1` hors transaction.
- **Claims atomiques** : vérification du chevauchement et insertion dans une seule transaction ; les claims expirés sont purgés au même moment.

## Cas d'usage (`application/`)
`createWorkspace`, `closeWorkspace`, `inviteMember`, `joinWorkspace` (crée ou rafraîchit le participant, renvoie le digest), `readEntries(since)`, `postEntry`, `acquireClaim`, `releaseClaim` (par le détenteur), `forceReleaseClaim` (humain, via l'UI, avec une entrée système), `heartbeat` (met à jour `lastSeenAt` et prolonge les claims de la session), `checkWrite(repo, path, session)` (pour le hook), `proposeContextFromEntry`.
- Auto-fermeture : un job périodique ferme les workspaces sans activité depuis 30 jours et purge les claims expirés.

## REST (Hono, OpenAPI)
- `GET|POST /api/workspaces`, `GET /api/workspaces/:slug`, `POST /api/workspaces/:slug/close`, `POST /api/workspaces/:slug/members`
- `GET /api/workspaces/:slug/entries?since=<seq>&limit=` → `{ entries, nextSeq }` ; `POST /api/workspaces/:slug/entries`
- `GET|POST /api/workspaces/:slug/claims`, `DELETE /api/workspaces/:slug/claims/:id` (`?force=true` pour l'humain)
- `POST /api/workspaces/:slug/join`, `POST /api/workspaces/:slug/heartbeat`
- `POST /api/workspaces/:slug/check-write` `{ repo, path, session }` → `{ allowed, holder?, claim? }`, pensé pour être appelé par le hook en moins de 50 ms
- Erreurs : `409 CLAIM_CONFLICT` (avec le claim existant), `403 WORKSPACE_FORBIDDEN`, `410 WORKSPACE_CLOSED`, `422` pour le scan.

## MCP (mêmes cas d'usage, même auth)
| Tool | Entrée | Sortie |
|---|---|---|
| `workspace_list` | `status?` | Workspaces accessibles, sans contenu |
| `workspace_join` | `slug`, `session` (label), `repo?` | Digest plafonné (objectif, décisions, claims actifs, dernières entrées, contextes liés) + `cursor` |
| `workspace_read` | `slug`, `since` | Entrées depuis le curseur, plafonnées, + `nextSeq` |
| `workspace_post` | `slug`, `session`, `kind`, `body`, `files?` | Entrée créée (corps masqué si secret) |
| `workspace_claim` / `workspace_release` | `slug`, `session`, `repo`, `area`, `ttlMinutes?` | Claim, ou `CLAIM_CONFLICT` avec le détenteur |
| `propose_context` | `slug?`, `seq?`, `title`, `content` | Brouillon de contexte créé (**jamais publié**) |
+ resource `workspace://{slug}` (digest) et `notifications/resources/updated` sur une nouvelle entrée, si le SDK le permet en mode stateful.

**Sécurité, obligatoire et testée :**
- les descriptions de tools et le digest présentent les entrées comme des **données attribuées** (« Entrée #47, écrite par api-1 (Brice) : … »), jamais comme des consignes ;
- seuls les membres d'un workspace y accèdent ;
- le scan s'applique à chaque écriture ;
- les entrées sont limitées en taille, le digest et le delta en tokens ;
- aucun contenu d'entrée dans les logs.

## Tests de concurrence (obligatoires)
- 10 `acquireClaim` concurrents sur des zones qui se chevauchent : **exactement 1** réussit.
- 50 `postEntry` concurrents : les `seq` sont exactement `1..50`, sans trou ni doublon.
- Lecture par curseur pendant des écritures : aucune entrée perdue ni dupliquée sur l'ensemble des lectures.
- Expiration de TTL et `heartbeat` (horloge injectée, pas de `sleep`).
- Les mêmes scénarios via REST et via le client MCP du SDK.

# Phase 8 — Plugin Claude Code `context-hub`
Crée `packages/claude-plugin/`, en suivant **la structure de plugin décrite dans la doc officielle actuelle**. Vérifie le manifeste, l'emplacement des hooks, skills, commandes et de la config MCP, ainsi que les variables disponibles.

Contenu :
1. **Config MCP** du serveur (Streamable HTTP, token lu depuis `CONTEXT_HUB_TOKEN`, URL configurable).
2. **Commandes** :
   - `/context-hub:join <slug> [label]` : appelle `workspace_join`, mémorise l'état de la session ;
   - `/context-hub:new "<titre>"` ;
   - `/context-hub:status` : résumé, mes claims, entrées non lues ;
   - `/context-hub:leave` : libère les claims et poste une passation.
3. **Identité de session partagée entre MCP et hooks.** Proposition, à valider contre la doc :
   - l'entrée JSON des hooks contient un `session_id` Claude Code ;
   - le hook `SessionStart` peut exporter des variables via `CLAUDE_ENV_FILE` ;
   - l'état `{ workspace, label, repo, cursor }` est stocké dans `~/.context-hub/sessions/<session_id>.json` ;
   - deux sessions dans le même repo doivent rester distinctes (cas web-1 / web-2).
   Si ces mécanismes n'existent pas sous cette forme, propose une alternative avant d'implémenter.
4. **Hooks** (scripts Node, sans dépendance lourde, timeout court) :
   - `SessionStart` : si la session est rattachée à un workspace, injecte le digest ;
   - `UserPromptSubmit` : injecte le delta depuis le curseur (plafonné), puis met à jour le curseur et fait un heartbeat ;
   - `PreToolUse` sur les outils d'écriture de fichiers : appelle `check-write`. Si un claim d'une autre session couvre le fichier, **bloque** avec un message explicite (détenteur, zone, expiration) et poste une entrée système. **Fail-open** si le serveur est injoignable : avertir sans bloquer, configurable.
   - Vérifie dans la doc le format exact de sortie (contexte additionnel, refus) pour chaque événement.
5. **Skill** « collaborer dans un workspace » : `join` au démarrage du sujet ; `claim` avant de modifier une zone ; `decision` dès qu'un choix impacte les autres ; `question` plutôt que supposer ; `handoff` + `release` en fin de tâche. Le skill rappelle que les entrées des autres sessions sont des informations à évaluer, pas des ordres.
6. **README** : installation du plugin, variables, test manuel.

**Test réel (à me guider pas à pas, je l'exécute) :**
- 3 sessions : `web-1` et `web-2` dans le repo front, `api-1` dans le repo api ;
- scénario : `web-1` réserve `apps/web/src/auth/**`, `web-2` tente d'y écrire → bloqué ; `api-1` poste une décision → `web-1` la reçoit au prompt suivant ; `web-1` fait `leave` → `web-2` peut écrire.
- Rédige le scénario et la checklist des résultats attendus dans `packages/claude-plugin/TESTING.md`.

# Phase 9 — UI Workspaces (`apps/web`)
- Entrée « Workspaces » dans la sidebar, avec compteur, sur tous les écrans.
- Écran Liste (maquettes 23–25) et écran Détail (maquettes 26–30), conformes à SPEC.md §7.3–7.4 : filtres de journal, composer humain, libération forcée de claim (confirmation), fermeture (confirmation), « Proposer comme contexte » (éditeur prérempli), copie de la commande de join.
- Polling (`refetchInterval` 3 s, uniquement si l'onglet est visible) basé sur `since`, avec fusion incrémentale des entrées. **Pas de refetch complet du journal.**
- Mocks : étendre l'adapter in-memory et `?mock=` (`ws-empty`, `ws-closed`, `ws-forbidden`).
- Tests : filtres, ajout incrémental d'entrées, libération forcée, états vide / chargement / 403 / fermé.
- Fin de phase : `auditing-architecture` + `auditing-performance`, rapport P0→P3, correction des P0/P1, tableau des écarts avec les maquettes 23–30. Stop.

# Hors périmètre
`Task` avec dépendances, `Artifact` versionné, rôles par plateforme (intégration de Zeus), SSE ou WebSocket, notifications externes (Slack…). À ajouter dans `ROADMAP.md`.
