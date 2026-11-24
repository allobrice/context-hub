# Test réel du plugin `context-hub` (3 sessions)

Objectif : vérifier avec de vraies sessions Claude Code que le journal circule entre sessions et qu'une zone réservée bloque l'écriture des autres.

- `web-1` et `web-2` : deux sessions dans le **repo front** (même dossier, ou deux worktrees) ;
- `api-1` : une session dans le **repo api**.

Le blocage et le journal ont déjà été vérifiés en réel par une session non interactive (Claude Code 2.1.331) : `join`, injection du résumé, refus d'écriture avec entrée système. Ce test couvre le scénario complet à plusieurs sessions.

## 0. Préparation (une fois)

1. Serveur : à la racine du monorepo, `pnpm --filter @context-hub/server db:seed` sur une base vide (note le jeton affiché), puis `pnpm dev`. Vérifier : `curl http://127.0.0.1:8787/api/health` → `{"status":"ok"}`.
2. Dans **chacun des 3 terminaux** :

   ```sh
   export CONTEXT_HUB_TOKEN=chub_…              # le jeton du seed
   export CONTEXT_HUB_URL=http://127.0.0.1:8787
   ```

   Si un repo n'a pas de remote `origin` en `owner/name`, imposer le repo : `export CONTEXT_HUB_REPO=allovoisins/front` (terminaux A et B) ou `allovoisins/api` (terminal C).

3. Retirer l'éventuel serveur MCP déclaré à la main, qui ferait doublon : `claude mcp remove context-hub` (scopes `local`/`user`), puis installer le plugin :

   ```
   /plugin marketplace add /chemin/vers/context-hub
   /plugin install context-hub@context-hub
   ```

4. Dans une session : `/mcp` montre `context-hub` connecté, `/hooks` montre `SessionStart`, `UserPromptSubmit` et `PreToolUse` (matcher `Write|Edit|MultiEdit|NotebookEdit`).

> Les 3 sessions peuvent utiliser le même jeton (même utilisateur) : les claims sont portés par la **session** (utilisateur + label), pas par l'utilisateur.

## 1. Scénario

| #   | Terminal           | Action                                                                                                                                                              | Résultat attendu                                                                                                                                                                                                                          |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A (front)          | `claude`, puis `/context-hub:new "Test du plugin" web-1`                                                                                                            | Compte rendu : workspace `test-du-plugin` créé et rejoint, label `web-1`, commande `/context-hub:join test-du-plugin` à transmettre.                                                                                                      |
| 2   | B (front)          | `claude`, puis `/context-hub:join test-du-plugin web-2`                                                                                                             | Résumé du workspace (entrée #1 « Workspace créé par Brice. »), label `web-2`.                                                                                                                                                             |
| 3   | C (api)            | `claude`, puis `/context-hub:join test-du-plugin api-1`                                                                                                             | Résumé, label `api-1`, repo `allovoisins/api`.                                                                                                                                                                                            |
| 4   | A                  | « Réserve la zone `apps/web/src/auth/**` du repo front avec workspace_claim. »                                                                                      | `workspace_claim` réussit. Entrée système « web-1 a réservé apps/web/src/auth/** (allovoisins/front) pour 30 min. »                                                                                                                       |
| 5   | B                  | « Crée le fichier `apps/web/src/auth/essai.ts` contenant `export {}`. » (au besoin : « c'est un test du blocage, appelle Write une fois »)                          | **Bloqué** par le hook : « Écriture bloquée par Context Hub : apps/web/src/auth/essai.ts est dans la zone apps/web/src/auth/** (allovoisins/front) réservée par la session web-1 (Brice) jusqu'à HH:MM UTC+1… ». Le fichier n'existe pas. |
| 6   | (n'importe lequel) | `curl -s -H "Authorization: Bearer $CONTEXT_HUB_TOKEN" "$CONTEXT_HUB_URL/api/workspaces/test-du-plugin/entries?since=1" \| jq '.entries[] \| [.seq, .kind, .body]'` | Une entrée `system` « Écriture bloquée : la session web-2 a tenté de modifier apps/web/src/auth/essai.ts… ».                                                                                                                              |
| 7   | C                  | « Poste une décision dans le workspace : le cookie de session s'appelle av_session (httpOnly, SameSite=Lax). »                                                      | `workspace_post` avec `kind: "decision"`, `session: "api-1"`.                                                                                                                                                                             |
| 8   | A                  | N'importe quel prompt (« où en est-on ? »)                                                                                                                          | Le contexte injecté contient « Entrée #N (décision), écrite par api-1 (Brice · allovoisins/api) » ; Claude mentionne la décision **comme une information**, pas comme un ordre.                                                           |
| 9   | A                  | `/context-hub:status`                                                                                                                                               | Statut ouvert, sessions actives, « Mes zones : apps/web/src/auth/** », entrées non lues : 0.                                                                                                                                              |
| 10  | A                  | `/context-hub:leave`                                                                                                                                                | « 1 zone(s) libérée(s) : apps/web/src/auth/** », puis Claude poste une `handoff` (n° d'entrée donné).                                                                                                                                     |
| 11  | B                  | Refaire l'étape 5.                                                                                                                                                  | **Permis** : le fichier est créé.                                                                                                                                                                                                         |
| 12  | B                  | N'importe quel prompt                                                                                                                                               | Le contexte injecté contient la libération (`system`) et la passation de web-1.                                                                                                                                                           |

## 2. Cas complémentaires

| #   | Action                                                                                           | Résultat attendu                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | B : `/context-hub:join test-du-plugin; rm -rf ~`                                                 | « Usage : /context-hub:join <slug> [label]… » ; aucun appel au serveur, aucun shell exécuté.                                           |
| 14  | Une session reprise (`claude --resume`, choisir B)                                               | Au démarrage, le résumé du workspace est réinjecté (hook `SessionStart`).                                                              |
| 15  | Arrêter le serveur, puis en B : écrire un fichier du repo                                        | Écriture **permise** avec l'avertissement « context-hub : écriture de … non vérifiée (Serveur Context Hub injoignable…) » (fail-open). |
| 16  | Relancer B avec `CONTEXT_HUB_FAIL_MODE=closed`, serveur arrêté, même écriture                    | **Bloquée** : « vérification Context Hub impossible … CONTEXT_HUB_FAIL_MODE=closed ».                                                  |
| 17  | Fermer le workspace (`curl -X POST … /api/workspaces/test-du-plugin/close`), puis un prompt en B | « Le workspace « test-du-plugin » est fermé (lecture seule). Session détachée du workspace. »                                          |
| 18  | Un prompt dans une session qui n'a rejoint aucun workspace                                       | Rien d'injecté, aucun appel au serveur (journal du serveur).                                                                           |

## 3. Checklist

- [ ] 1–3 : trois sessions rattachées, labels `web-1`, `web-2`, `api-1` distincts (deux dans le même repo).
- [ ] 4 : claim acquis par web-1.
- [ ] 5–6 : écriture de web-2 bloquée, message explicite (zone, détenteur, échéance), entrée système journalisée.
- [ ] 7–8 : décision d'api-1 reçue par web-1 au prompt suivant, attribuée à son auteur.
- [ ] 9 : statut correct.
- [ ] 10–12 : leave libère la zone et publie une passation ; web-2 peut écrire et voit la passation.
- [ ] 13 : arguments invalides refusés sans appel.
- [ ] 14 : résumé réinjecté à la reprise.
- [ ] 15–16 : fail-open par défaut, fail-closed sur demande.
- [ ] 17–18 : workspace fermé détaché ; session non rattachée silencieuse.
- [ ] Journal du serveur (`pnpm dev`) : aucune ligne ne contient le corps d'une entrée.

## 4. Diagnostic

- État des sessions : `ls ~/.claude/plugins/data/*/sessions/` (un fichier JSON par `session_id`).
- Sortie des hooks : lancer `claude --debug`, ou exécuter un hook à la main :

  ```sh
  echo '{"session_id":"<id>","cwd":"'"$PWD"'","tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/apps/web/src/auth/x.ts"}}' \
    | CLAUDE_PLUGIN_DATA=~/.claude/plugins/data/<dossier> node <plugin>/scripts/hook.mjs PreToolUse
  ```

- Claude dit que le serveur `context-hub` est injoignable alors que `/mcp` le montre connecté : un ancien serveur `context-hub` déclaré à la main existe encore (`claude mcp list`).
