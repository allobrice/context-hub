# Context Hub : serveur

Serveur Node (Hono) de Context Hub :

- `/api/*` : API REST de l'UI, contrat OpenAPI sur `/api/openapi.json` (commité dans `openapi.json`) ;
- `/mcp` : serveur MCP en Streamable HTTP pour les sessions Claude Code ;
- persistance SQLite (Drizzle, recherche plein texte FTS5).

Règles de développement : `CLAUDE.md` (ce dossier) et `CLAUDE.md` à la racine.

## Démarrer en local

```sh
pnpm install                                   # à la racine
pnpm --filter @context-hub/server db:init      # base VIDE + jeton de dev, affiché UNE fois
# ou : db:seed pour la démo des maquettes (42 contextes, tags et collections de démo)
pnpm --filter @context-hub/server dev          # http://127.0.0.1:8787
```

Le seed n'écrit que dans une base vide (`data/context-hub.db` par défaut). Pour repartir des données de démo, supprimer ce fichier puis relancer `db:seed`. Seul le hash sha-256 du jeton est stocké : un jeton perdu ne se retrouve pas, on en génère un nouveau avec une nouvelle base.

Pour l'UI branchée sur ce serveur : dans `apps/web/.env.local`, `VITE_DATA_SOURCE=http` et `CONTEXT_HUB_DEV_TOKEN=<jeton>` (injecté par le proxy Vite, jamais envoyé par le navigateur), puis `pnpm dev` à la racine.

Configuration facultative dans `apps/server/.env.local` (voir `.env.example`) : hôte, port, origine du front pour CORS, hôtes acceptés sur `/mcp`, chemin de la base.

Le jeton se garde dans l'environnement, jamais dans un fichier versionné :

```sh
export CONTEXT_HUB_TOKEN=chub_…   # jeton affiché par db:seed
```

## Surface MCP

| Primitive                                       | Détail                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource template `context://{+slug}`           | Dernière version **publiée**, en `text/markdown`. `resources/list` renvoie les contextes publiés visibles, avec leur titre et leur description.                                      |
| Resource template `context://{+slug}@{version}` | Version publiée figée (immuable).                                                                                                                                                    |
| Tool `search_contexts`                          | `query`, `tags?`, `collection?`, `limit` (20 au plus). Renvoie titre, description, URI, version et estimation de tokens, **sans le contenu**. Ne cherche que dans le contenu publié. |
| Tool `get_context`                              | `slug`, `version?`. Renvoie le contenu, sous forme de ressource embarquée.                                                                                                           |
| `notifications/resources/list_changed`          | Envoyée aux sessions ouvertes à chaque publication, archivage ou désarchivage.                                                                                                       |

Les brouillons et les contextes archivés ne sont jamais servis. Les portées sont appliquées : un contexte `personal` n'est visible que par son propriétaire. Chaque lecture est enregistrée dans `mcp_reads`, ce qui alimente « lectures MCP (7 j) » dans l'UI. Le contenu d'un contexte est renvoyé comme une donnée : c'est de la documentation de référence, pas des instructions système.

Les deux révisions du protocole sont servies : 2025-11-25, avec sessions et `Mcp-Session-Id`, et 2026-07-28, via `subscriptions/listen`.

### Header de repo (projet)

Un `.mcp.json` de projet peut envoyer `X-Context-Hub-Repo: <org>/<repo>`. `search_contexts` place alors en tête les contextes de portée `project` de ce repo, et exclut ceux des autres repos. **Ce n'est pas une frontière de sécurité**, seulement un filtre de pertinence : les portées restent appliquées par le serveur, quel que soit ce header.

## Connecter Claude Code

### Scope user : `claude mcp add`

```sh
claude mcp add --transport http --scope user context-hub http://127.0.0.1:8787/mcp \
  --header "Authorization: Bearer $CONTEXT_HUB_TOKEN"
```

Les options valides de `--scope` sont `local` (défaut), `user` et `project`. `--header` (forme courte `-H`) peut être répété : `claude mcp add --help`.

> ⚠️ Entre guillemets doubles, `$CONTEXT_HUB_TOKEN` est développé **par le shell** au moment de la commande. Le jeton est alors écrit en clair dans la configuration utilisateur de Claude Code (`~/.claude.json`). Pour ne jamais écrire le jeton dans un fichier, préférer le `.mcp.json` ci-dessous : Claude Code y développe `${CONTEXT_HUB_TOKEN}` à l'exécution.

### Scope project : `.mcp.json` versionné dans le repo

```json
{
  "mcpServers": {
    "context-hub": {
      "type": "http",
      "url": "${CONTEXT_HUB_URL:-http://127.0.0.1:8787}/mcp",
      "headers": {
        "Authorization": "Bearer ${CONTEXT_HUB_TOKEN}",
        "X-Context-Hub-Repo": "allovoisins/front"
      }
    }
  }
}
```

- Claude Code développe `${VAR}` et `${VAR:-défaut}` dans `url` et `headers`. Si `CONTEXT_HUB_TOKEN` n'est pas défini, `claude mcp list` affiche un avertissement et la requête part avec le texte `${CONTEXT_HUB_TOKEN}` : le serveur répond 401.
- En session interactive, Claude Code demande une approbation avant d'utiliser un serveur déclaré par `.mcp.json`. Pour revenir sur ce choix : `claude mcp reset-project-choices`.

### Utiliser un contexte dans un prompt

```text
Applique @context-hub:context://nuxt/conventions-nuxt-4 à ce composant.
```

Taper `@` liste les ressources disponibles, avec une recherche approximative. Pour figer une version : `@context-hub:context://nuxt/conventions-nuxt-4@4`.

En session interactive, Claude Code recharge la liste des ressources quand il reçoit `list_changed` ; il n'y a pas besoin de se reconnecter après une publication. En mode non interactif (`claude -p`) et dans l'Agent SDK, seule la liste des outils est rechargée.

## Tester avec MCP Inspector

```sh
npx @modelcontextprotocol/inspector   # Node ^22.23.4, ^24.22.1 ou >=26.12.1 requis par l'Inspector
```

L'interface s'ouvre sur `http://127.0.0.1:6274`. Choisir le transport HTTP, l'URL `http://127.0.0.1:8787/mcp` et un header `Authorization: Bearer <jeton>`. L'interface web passe par le backend Node de l'Inspector, qui se connecte lui-même au serveur : la validation du Host et de l'Origin de `/mcp` l'accepte telle quelle. Le jeton qu'affiche l'Inspector au lancement protège sa propre API ; ce n'est pas le jeton Context Hub.

En ligne de commande :

```sh
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http \
  --header "Authorization: Bearer $CONTEXT_HUB_TOKEN" --method resources/list
```

Les autres méthodes utiles sont `tools/list` et `resources/templates/list`.

Sans jeton, le 401 (`WWW-Authenticate: Bearer`) pousse l'Inspector vers un flux OAuth, que Context Hub ne propose pas en v1 : toujours fournir le header `Authorization`. Commandes vérifiées avec Node 24.22.1 (version épinglée par Volta).

## Sécurité, en bref

- Jetons comparés à leur hash sha-256 en base ; toutes les routes exigent `Authorization: Bearer`, sauf `/api/health`.
- `/mcp` : validation du `Host` (protection contre le DNS rebinding : `CONTEXT_HUB_ALLOWED_HOSTS`) et de l'`Origin`. Une session MCP est liée à l'utilisateur qui l'a ouverte.
- CORS de `/api` limité à l'origine du front ; écoute sur `127.0.0.1` par défaut.
- Le serveur rescanne le contenu à la publication et refuse un secret (422).
- Aucun contenu de contexte, corps de requête ni jeton dans les journaux.
