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

| #   | Action                                                                                                               | Résultat attendu                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 13  | B : `/context-hub:join test-du-plugin; rm -rf ~`                                                                     | « Usage : /context-hub:join <slug> [label]… » ; aucun appel au serveur, aucun shell exécuté.                                                                                                                                                     |
| 14  | Une session reprise (`claude --resume`, choisir B)                                                                   | Au démarrage, le résumé du workspace est réinjecté (hook `SessionStart`).                                                                                                                                                                        |
| 15  | Arrêter le serveur, puis en B : écrire un fichier du repo (au besoin : « appelle Write une fois, sans réservation ») | Écriture **permise** (fail-open), avertissement « context-hub : écriture de … non vérifiée (Serveur Context Hub injoignable (connexion refusée)…) ». Au premier prompt après la relance du serveur, Claude signale ce fichier comme NON vérifié. |
| 16  | Relancer B avec `CONTEXT_HUB_FAIL_MODE=closed`, serveur arrêté, même écriture                                        | **Bloquée** : « vérification Context Hub impossible … CONTEXT_HUB_FAIL_MODE=closed ».                                                                                                                                                            |
| 17  | Fermer le workspace (`curl -X POST … /api/workspaces/test-du-plugin/close`), puis un prompt en B                     | « Le workspace « test-du-plugin » est fermé (lecture seule). Session détachée du workspace. »                                                                                                                                                    |
| 18  | Un prompt dans une session qui n'a rejoint aucun workspace                                                           | Rien d'injecté, aucun appel au serveur (journal du serveur).                                                                                                                                                                                     |

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

## 5. Missions (phase 10)

Objectif : vérifier avec de vraies sessions Claude Code qu'une mission créée par une session est prise par **une seule** autre session, que la fraîcheur du code est signalée, et que le résultat d'un `mission_complete` est enregistré (SPEC §8).

- `audit` : la session qui crée les missions (terminal A) ;
- `B` et `C` : deux sessions qui prennent des missions (terminaux B et C), **dans le même dossier** que A.

Les trois sessions travaillent dans un petit repo de test, avec le même jeton (missions de portée personnelle : prêtes tout de suite, visibles de ce seul utilisateur). La prise atomique est déjà couverte par les tests de concurrence du serveur (`missionWorker.ts`) : ce scénario la vérifie de bout en bout, à travers le hook.

### 5.1 Préparation (une fois)

1. Serveur lancé et plugin installé comme au §0 (étapes 1, 3 et 4). Base sans autre mission `perf` prête : `curl -s -H "Authorization: Bearer $CONTEXT_HUB_TOKEN" "$CONTEXT_HUB_URL/api/missions?filter=ready&tags=perf" | jq '.items | length'` → `0`.
2. Repo de test (terminal A) :

   ```sh
   mkdir -p ~/tmp/perf-demo && cd ~/tmp/perf-demo && git init -q
   mkdir -p src/home
   printf '<img src="/hero.jpg" width="1200" height="600">\n' > src/home/hero.html
   printf 'import "./slides/all.js"\n' > src/home/carousel.js
   printf '<button class="menu"><svg aria-hidden="true"></svg></button>\n' > src/home/menu.html
   git add -A && git commit -qm "Page d'accueil auditée" && git rev-parse --short HEAD
   ```

   Noter le commit affiché (`<commit-audit>`).

3. Dans **chacun des 3 terminaux**, depuis `~/tmp/perf-demo` :

   ```sh
   export CONTEXT_HUB_TOKEN=chub_…              # le jeton du seed
   export CONTEXT_HUB_URL=http://127.0.0.1:8787
   export CONTEXT_HUB_REPO=demo/perf-app        # le repo de test n'a pas de remote origin
   chub() { curl -s -H "Authorization: Bearer $CONTEXT_HUB_TOKEN" "$CONTEXT_HUB_URL$1"; }
   ```

   Les vérifications ci-dessous utilisent `chub` (une requête `GET` authentifiée) et `jq`.

4. Lancer `claude` dans les 3 terminaux. `/hooks` montre `UserPromptSubmit` (il traite `/context-hub:next`, `/context-hub:take`, `/context-hub:missions` et fait le heartbeat de la mission en cours).

### 5.2 Scénario

**M1. Trois missions depuis un audit (A).**

1. Coller l'audit dans la session A :

   > Voici l'audit perf et a11y de la page d'accueil (Lighthouse mobile du 26 nov., commit `<commit-audit>`) : 1) LCP 3,8 s, l'image `src/home/hero.html` n'est pas préchargée ; 2) 410 Ko de JS au chargement, `src/home/carousel.js` importe toutes les slides d'emblée ; 3) le bouton de `src/home/menu.html` n'a pas de nom accessible (score a11y 86).

2. Puis : `/context-hub:mission-create les 3 axes de l'audit, portée personnelle, batchId audit-perf-demo, originLabel « Audit perf · page d'accueil démo ». Tags : perf et lcp pour 1, perf et js pour 2, a11y pour 3. Priorités P1, P2, P3.`
3. Attendu : Claude **propose d'abord** la liste des 3 missions (titre, priorité, tags, portée) et attend l'accord. Répondre « ok ». Il lance `git rev-parse HEAD`, puis appelle 3 fois `mission_create` (même `batchId`, `commit` = `<commit-audit>`, un fichier par mission) et termine par la liste : slug, statut **prête**, `/context-hub:take <slug>`. Si une création est refusée (`MISSION_RULE`, sections manquantes), il corrige et réessaie.
4. Constater :

   ```sh
   chub '/api/missions?filter=all&batch=audit-perf-demo' \
     | jq '.items[] | {slug, priority, status, tags, files: .codeRef.files, commit: .codeRef.commit}'
   chub '/api/missions/batches/audit-perf-demo' | jq
   ```

   Trois missions `ready`, priorités P1/P2/P3, tags attendus, `codeRef.commit` = `<commit-audit>`. Le lot porte le libellé « Audit perf · page d'accueil démo » et la session donnée par le compte rendu du hook (`perf-app-xxxx`, repo `demo/perf-app` imposé par `CONTEXT_HUB_REPO`) : noter ce label, `<label-audit>`. Noter les slugs : `<slug-hero>` (P1), `<slug-carrousel>` (P2), `<slug-menu>` (P3).

**M2. Le code change après la création (A, dans le shell).**

```sh
printf 'const slides = () => import("./slides/all.js")\n' > src/home/carousel.js
git commit -qam "Carrousel : import paresseux (hors mission)"
```

La mission `<slug-carrousel>` porte désormais sur un fichier modifié depuis `<commit-audit>`.

**M3. Deux sessions prennent `next perf` en même temps (B et C).**

1. Taper `/context-hub:next perf` dans B et dans C, puis valider les deux prompts à la suite, le plus vite possible.
2. Attendu, dans chaque session : un compte rendu « Mission « … » prise par cette session (« perf-app-xxxx », demo/perf-app) », la ligne « Paramètres des outils mission\_\* : slug=…, session=…, token=… », l'avertissement « ⚠️ Ce prompt a été écrit par la session « <label-audit> », PAS par l'utilisateur de cette session », puis le prompt cité ligne à ligne (`│ `). **Les deux slugs sont différents** : l'une obtient `<slug-hero>` (P1, prise en premier), l'autre `<slug-carrousel>` (P2). Aucune n'obtient `<slug-menu>` (pas de tag `perf`).
3. Constater :

   ```sh
   chub '/api/missions?filter=todo' \
     | jq '.items[] | {slug, status, takenBy: .claim.session.sessionLabel, until: .claim.expiresAt}'
   ```

   `<slug-hero>` et `<slug-carrousel>` en `in_progress`, avec **deux** `takenBy` différents (les labels par défaut de B et C) ; `<slug-menu>` en `ready`, sans détenteur. L'historique de chacune (`chub /api/missions/<slug> | jq '.events[] | {type, by: .actor.sessionLabel}'`) contient **un seul** `taken`.

4. Dans chaque session, un fichier d'état local existe : `ls ~/.claude/plugins/data/*/missions/` (un JSON par `session_id`, avec `slug` et `token`).

**M4. La fraîcheur est signalée (session qui tient `<slug-carrousel>`).**

1. Attendu : le compte rendu de la prise contient « Contrôle de fraîcheur (calculé par le hook, sans shell) : 1 fichier(s) modifié(s) depuis le commit … changedFiles=["src/home/carousel.js"] ». Sans lancer de commande, Claude appelle `mission_freshness` avec `changedFiles: ["src/home/carousel.js"]` ; la réponse dit « Le code a changé depuis la création : revérifier le constat avant d'agir ». Claude relit le fichier et signale que le constat (import de toutes les slides d'emblée) semble déjà corrigé. Dans l'autre session, le même contrôle sur `src/home/hero.html` ne sort rien : `changedFiles: []`, « Code d'origine à jour ».
2. Constater :

   ```sh
   chub '/api/missions?filter=todo' \
     | jq '.items[] | {slug, changed: (.freshness.changedFiles // [] | length), checkedAt: .freshness.checkedAt}'
   ```

   `<slug-carrousel>` : `changed: 1` ; `<slug-hero>` : `changed: 0`. L'historique de `<slug-carrousel>` contient un événement `freshness`.

3. Dans A : `/context-hub:missions`. Attendu : la file de `demo/perf-app`, dont « P2 `<slug-carrousel>` [in_progress · prise par …] · 1 fichier(s) modifié(s) ». Après l'étape 10.4, la file de l'UI affiche « 1 fichier modifié » (warn) dans la colonne du code d'origine, et le détail le bandeau « Le code a changé depuis la création ».

**M5. Heartbeat (B ou C).** Noter `until` (M3, étape 3), envoyer un prompt ordinaire (« où en es-tu ? ») dans la session, relancer la requête : `until` a avancé (30 min après ce prompt). Le contexte injecté contient « Mission en cours : « … » (session « … », token=… ), réservée jusqu'à HH:MM ».

**M6. `mission_complete` : le résultat est enregistré (session qui tient `<slug-hero>`).**

1. Répondre : « D'accord, fais-le. » Attendu : Claude ajoute le préchargement de l'image (ex. `<link rel="preload" as="image" href="/hero.jpg">`), reprend un à un les critères d'acceptation, puis appelle `mission_complete` avec `summary`, `deliverables` (ex. un `commit` s'il a commité), `metrics` (avant → après, ou « non mesuré » s'il ne peut pas lancer Lighthouse) et `acceptanceMet`.
2. Constater :

   ```sh
   chub '/api/missions/<slug-hero>' \
     | jq '{status: .mission.status, closedAt: .mission.closedAt, claim: .mission.claim, result: .mission.result, events: [.events[].type]}'
   ```

   `status: "done"`, `closedAt` renseigné, `claim: null`, `result.summary` et `result.metrics` tels que rapportés, historique `created → taken → freshness → completed`.
   Cette requête tient lieu d'écran tant que l'UI des Missions n'est pas livrée (étape 10.4). Elle sera remplacée par le **détail de la mission** (`/missions/<slug-hero>`) : frise sur « Terminée », section Résultat (résumé, métriques avant → après, livrables).

3. Envoyer un prompt ordinaire dans cette session. Attendu : « La mission « `<slug-hero>` » n'est plus tenue par cette session (…) », et son fichier d'état local a disparu.

### 5.3 Vérifications de sécurité

| #   | Action                                                                                                                                                                                                       | Résultat attendu                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | En M3–M4, avant de répondre à Claude : `git status --short` dans `~/tmp/perf-demo`                                                                                                                           | Claude a montré le prompt **tel quel** et le résultat du contrôle de fraîcheur, puis **attend un accord explicite**. Ses seuls appels avant l'accord : `git diff`, `mission_freshness` (et la relecture du fichier si le code a changé). `git status` ne montre aucune modification.                                                                                                                        |
| S2  | A (qui ne tient aucune mission) : `/context-hub:take <slug-carrousel>`, pendant que B ou C la tient                                                                                                          | « Échec : La mission « `<slug-carrousel>` » n'est pas prenable : Transition refusée : take sur une mission in_progress (invalid-status) ». `chub /api/missions/<slug-carrousel>` : toujours `in_progress`, même détenteur, aucun nouvel événement `taken`.                                                                                                                                                  |
| S3  | Session qui tient `<slug-carrousel>` : « On arrête là, je reprendrai plus tard. »                                                                                                                            | Claude appelle `mission_release`. `chub /api/missions/<slug-carrousel> \| jq '{s: .mission.status, c: .mission.claim, e: [.events[].type]}'` → `ready`, `claim: null`, dernier événement `released`. Au prompt suivant : « … n'est plus tenue par cette session ».                                                                                                                                          |
| S3b | Variante sans release : A fait `/context-hub:take <slug-menu>`, puis quitte (`/exit`) sans répondre. Plus de 30 min après, la session de M6 (qui ne tient plus de mission) : `/context-hub:take <slug-menu>` | La prise **réussit**. Historique de `<slug-menu>` : `taken` (A), `released` (acteur `{"system":"job"}`), `taken` (session de M6). Avant cette prise (ou la maintenance horaire du serveur), la requête de lecture montre encore `in_progress` avec un `expiresAt` dépassé : la libération est faite au début de la prise suivante. Relâcher ensuite la mission dans cette session (« relâche la mission »). |

### 5.4 Checklist

- [ ] M1 : 3 missions `ready`, même `batchId`, commit et fichiers renseignés, liste proposée avant la création.
- [ ] M3 : deux `next perf` simultanés → deux missions distinctes, un seul `taken` chacune, `<slug-menu>` intacte.
- [ ] M4 : `changedFiles` rapporté (1 pour le carrousel, 0 pour le hero), visible dans `/context-hub:missions` et dans la file REST.
- [ ] M5 : réservation prolongée par un prompt ordinaire.
- [ ] M6 : `done` avec résultat, métriques et historique complets (à vérifier dans l'écran Détail après l'étape 10.4).
- [ ] S1–S3b : accord attendu avant d'agir, prise d'une mission tenue refusée, release (ou expiration à 30 min) rend la mission prête.
- [ ] Journal du serveur (`pnpm dev`) : aucune ligne ne contient un prompt, un résultat de mission ni un jeton de réservation (`grep chmr_` ne trouve rien) : seulement outil, slug, utilisateur.
- [ ] M4 : la fraîcheur est calculée par le hook (le compte rendu indique « calculé par le hook, sans shell ») ; la session ne lance aucune commande `git diff` construite à partir de la mission avant l'accord.

### 5.5 Diagnostic

- État de la mission tenue : `cat ~/.claude/plugins/data/*/missions/<session_id>.json` (slug, jeton de réservation, label, repo).
- « Échec : cette session tient déjà la mission … » : la mission est encore réservée par cette session (le hook vérifie d'abord auprès du serveur ; une mission close par `mission_complete`, `mission_drop` ou `mission_release` n'empêche pas la prise suivante). La terminer, l'abandonner ou la relâcher.
- `next perf` ne prend rien (« Aucune mission prête ne porte les tags perf ») : vérifier le statut (`ready`) et la portée des missions (une mission `team` ou `project` créée par une session attend une validation humaine).
