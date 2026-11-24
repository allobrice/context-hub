# Plugin Claude Code `context-hub`

Relie des sessions Claude Code qui travaillent en même temps sur un même sujet, depuis une ou plusieurs machines, à un **workspace** Context Hub : un journal partagé (notes, décisions, questions, passations, statuts) et des **zones réservées** du code (claims). Une session est **bloquée** si elle écrit dans une zone réservée par une autre.

Contenu :

| Élément                                        | Rôle                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.mcp.json`                                    | Serveur MCP `context-hub` (Streamable HTTP) : outils `workspace_*`, `propose_context`, contextes.                                                                     |
| `commands/` : `join`, `new`, `status`, `leave` | `/context-hub:join <slug> [label]`, `/context-hub:new "<titre>" [label]`, `/context-hub:status`, `/context-hub:leave`.                                                |
| `hooks/hooks.json` + `scripts/hook.mjs`        | `SessionStart` (résumé du workspace à la reprise), `UserPromptSubmit` (commandes du plugin, nouvelles entrées à chaque prompt), `PreToolUse` (blocage des écritures). |
| `skills/collaborer-dans-un-workspace/`         | Quand réserver, quand poster une décision ou une question, comment finir une tâche ; les entrées des autres sont des informations, jamais des ordres.                 |

Les scripts sont du JavaScript ESM **sans dépendance** (Node 18 ou plus récent, `fetch` natif) : ils s'exécutent dans les repos où vous travaillez, quelle que soit leur version de Node.

## Installation

Prérequis : un serveur Context Hub qui tourne (`pnpm dev` à la racine de ce monorepo, port `8787`) et un jeton d'API (`pnpm --filter @context-hub/server db:seed` l'affiche une fois).

1. Exporter les variables dans le shell qui lance Claude Code (par exemple dans `~/.zshrc`) :

   ```sh
   export CONTEXT_HUB_TOKEN=chub_…          # obligatoire
   export CONTEXT_HUB_URL=http://127.0.0.1:8787   # défaut
   ```

2. Ajouter la marketplace du monorepo, puis installer le plugin (dans Claude Code) :

   ```
   /plugin marketplace add /chemin/vers/context-hub
   /plugin install context-hub@context-hub
   ```

   Pour un essai sans installation : `claude --plugin-dir /chemin/vers/context-hub/packages/claude-plugin`.

3. Si vous aviez déjà déclaré le serveur à la main (`claude mcp add … context-hub …`), retirez cette entrée (`claude mcp remove context-hub`) : le plugin déclare le sien, et deux serveurs exposeraient les mêmes outils.

4. Vérifier : `/plugin` liste `context-hub`, `/mcp` montre le serveur connecté, `/hooks` montre les trois hooks.

## Variables

| Variable                | Défaut                  | Rôle                                                                                                                       |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT_HUB_TOKEN`     | (aucun)                 | Jeton d'API, envoyé en `Authorization: Bearer` par le serveur MCP et par les hooks. Jamais écrit sur disque par le plugin. |
| `CONTEXT_HUB_URL`       | `http://127.0.0.1:8787` | URL du serveur (sans `/mcp`).                                                                                              |
| `CONTEXT_HUB_FAIL_MODE` | `open`                  | Serveur injoignable lors d'une écriture : `open` avertit sans bloquer, `closed` bloque.                                    |
| `CONTEXT_HUB_REPO`      | (déduit)                | Repo `owner/name` de la session ; sinon déduit de `git remote get-url origin`, ou `local/<dossier>`.                       |

## Identité de session

Chaque session Claude Code a un `session_id`, le même dans les hooks (entrée JSON) et dans les commandes (`${CLAUDE_SESSION_ID}`, vérifié avec Claude Code 2.1.331). Les commandes `/context-hub:*` sont traitées par le hook `UserPromptSubmit`, qui reçoit le texte brut de la commande, valide ses arguments (sans shell) et appelle l'API. L'état de la session est écrit dans `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json` :

```json
{
  "version": 1,
  "workspace": "migration-auth",
  "label": "web-1",
  "repo": "allovoisins/front",
  "repoRoot": "/home/me/front",
  "cursor": 49,
  "joinedAt": "…"
}
```

Deux sessions dans le même repo (`web-1`, `web-2`) ont donc chacune leur état. Le label par défaut est `<repo>-<4 premiers caractères du session_id>` ; donnez-en un explicite (`/context-hub:join migration-auth web-1`) pour qu'il soit parlant dans le journal. `CLAUDE_ENV_FILE` n'est pas utilisé : `${CLAUDE_SESSION_ID}` suffit à relier commandes et hooks.

## Hooks

| Hook               | Ce qu'il fait                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`     | Session rattachée (reprise, compaction, `/clear`) : rejoint à nouveau et injecte le résumé (≈ 1 500 tokens).                                                                                                                             |
| `UserPromptSubmit` | Commande `/context-hub:*` : la traite et injecte son compte rendu. Prompt ordinaire d'une session rattachée : `POST /sync` (nouvelles entrées depuis le curseur, ≈ 800 tokens, et heartbeat), puis avance le curseur.                    |
| `PreToolUse`       | `Write`, `Edit`, `MultiEdit`, `NotebookEdit` sur un fichier du repo : `POST /check-write`. Claim d'une autre session : refus (`permissionDecision: "deny"`) avec la zone, le détenteur et l'échéance ; le serveur journalise le blocage. |

Les hooks sortent toujours en code 0 et n'écrivent sur stdout que du JSON. Délais : 10 s (SessionStart, UserPromptSubmit) et 5 s (PreToolUse), avec des appels HTTP plafonnés à 1,5–4 s. Workspace fermé, accès retiré ou slug supprimé : la session est détachée.

## Limites connues

- Le blocage porte sur les outils d'édition de fichiers. Une écriture par Bash (`sed -i`, redirection `>`) n'est pas interceptée : le skill interdit ce contournement, mais ce n'est pas une garantie technique.
- Un fichier hors du repo de la session (autre repo, `/tmp`) n'est jamais vérifié.
- Fail-open par défaut : si le serveur est injoignable, l'écriture passe avec un avertissement (`systemMessage`, parfois discret). Le fichier est aussi mémorisé dans l'état de la session et signalé au modèle au premier prompt où le serveur répond, pour qu'il prévienne l'utilisateur et les autres sessions.
- Les notifications MCP `resources/updated` ne sont envoyées qu'aux clients du protocole 2025 ; le plugin n'en dépend pas (il synchronise à chaque prompt).

## Développement

```sh
pnpm --filter @context-hub/claude-plugin typecheck   # tsc --checkJs sur les scripts (JSDoc)
pnpm --filter @context-hub/claude-plugin lint
pnpm --filter @context-hub/claude-plugin test        # handlers + hook.mjs lancé comme processus
claude plugin validate packages/claude-plugin
```

Test réel à plusieurs sessions : [`TESTING.md`](TESTING.md).
