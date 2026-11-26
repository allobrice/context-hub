# Prompt Claude Code — Missions (phase 10)

À coller dans Claude Code, en plan mode, à la racine du monorepo Context Hub, après avoir remplacé `design-kit/` par cette version du kit.

---

# Mission
Ajouter à Context Hub les **Missions** : du travail préparé par une session (ou un humain) pour une autre session, présente ou future. Une mission est prise par **une seule** session, traitée, puis archivée avec son résultat. Exemple de référence : un audit perf de la home Nuxt produit une mission par axe d'amélioration.
Une mission est **une instruction à exécuter**, pas une donnée. La sécurité (validation humaine, scan, accord de l'utilisateur avant d'agir) n'est pas optionnelle.
L'existant (bibliothèque, workspaces, plugin, UI) ne doit pas régresser : tous les tests restent verts.

# Références
- `design-kit/SPEC.md` **§8** : modèle, cycle de vie, gabarit, écrans. Source de vérité.
- `design-kit/maquettes/png/31…39-*.png` et `maquettes/html/` : rendu attendu. La sidebar de tous les écrans gagne l'entrée « Missions ».
- Le code des Workspaces : réutilise leurs mécanismes (réservation atomique avec durée de vie, heartbeat, scan, identité de session du plugin) au lieu de les dupliquer. **Si un mécanisme doit être extrait pour être partagé, propose-le dans le plan.**
- Doc Claude Code et doc du SDK MCP : vérifie chaque API avant de l'utiliser.

# Mode de travail
1. **Plan mode d'abord.** Rien n'est modifié avant que j'aie validé ton plan.
2. 4 étapes (ci-dessous). À la fin de chaque étape : `pnpm -r typecheck && pnpm -r lint && pnpm -r test` au vert, résumé de 5 lignes maximum, puis **stop**. Tu ne passes à l'étape suivante qu'avec mon accord explicite.
3. Si une contrainte est impossible avec l'API réelle, arrête-toi et propose une alternative.

# Skills (plugin frontend-toolkit)
| Skill | Quand |
|---|---|
| `frontend-toolkit:auditing-architecture` | Plan (mutualisation avec les Workspaces), puis audit final |
| `frontend-toolkit:developing-typescript` | Machine à états (unions discriminées par statut, transitions typées), schémas Zod |
| `frontend-toolkit:writing-clean-code` | En continu, et en revue des fichiers modifiés à chaque fin d'étape |
| `frontend-toolkit:developing-scss` | Étape 10.4 (écrans, tokens existants uniquement) |
| `frontend-toolkit:auditing-performance` | Fin de l'étape 10.4 |

# 10.1 — Domaine et persistance
- Types et schémas de SPEC §8.1. **Machine à états** de §8.2 en fonctions pures : `transition(mission, event, actor) → Result<Mission, TransitionError>`. Toutes les transitions de la table sont testées, ainsi que toutes les transitions interdites.
- `validatePromptTemplate(md)` : sections obligatoires de §8.3 et liste des sections manquantes.
- Tables : `missions`, `mission_events` (append-only). Index sur `(status, priority, created_at)` et sur les tags.
- `take` atomique : sélection et réservation dans une transaction. Pour `next`, c'est la mission prête la plus prioritaire, puis la plus ancienne, qui correspond aux filtres.
- Job : expiration (`expiresAt`, 14 jours par défaut) et libération des réservations expirées.
- **Tests de concurrence** : 10 `take` simultanés sur la même mission → exactement 1 succès ; 10 `next` simultanés sur 3 missions prêtes → 3 succès distincts et 7 « file vide ».

# 10.2 — REST et MCP
- REST :
  - `GET|POST /api/missions` (filtres status, tags, repo, batch) ;
  - `GET|PATCH /api/missions/:slug` ;
  - `POST /api/missions/:slug/validate` et `/reject` ;
  - `POST /api/missions/:slug/release`, `/drop`, `/reopen` ;
  - `GET /api/missions/batches/:id` (synthèse du lot pour le bloc « Origine »).
- Tools MCP :
  | Tool | Effet |
  |---|---|
  | `mission_create` | Crée une mission : statut `draft` ou `ready` selon la portée (§8.2), gabarit vérifié, scan. Accepte `batchId` / `originLabel` pour regrouper les missions d'un même audit |
  | `mission_list` | Filtres : statut, tags, repo. Sans le prompt (titres et résumés seulement) |
  | `mission_take` | Par `slug`, ou `next: { tags?, repo? }`. Réserve la mission et renvoie le prompt, le `codeRef` et les contextes liés |
  | `mission_freshness` | La session rapporte `changedFiles` après `git diff` |
  | `mission_complete` | `summary` obligatoire, `deliverables`, `metrics`, `acceptanceMet` |
  | `mission_drop` / `mission_release` | `reason` obligatoire pour `drop` |
- La description de `mission_take` et le contenu renvoyé rappellent que le prompt vient d'une autre session : à **montrer à l'utilisateur et faire approuver avant exécution**.
- Prompts MCP (§8.5) : expose les contextes marqués `exposeAsPrompt` via `prompts/list` et `prompts/get`. Vérifie le support dans la doc du SDK, puis teste dans le CLI.

# 10.3 — Plugin Claude Code
- Commandes :
  - `/context-hub:next [tag]` ;
  - `/context-hub:take <slug>` ;
  - `/context-hub:missions` (file filtrée sur le repo courant) ;
  - `/context-hub:mission-create` (aide à créer une mission depuis la session en cours, avec le gabarit).
- Skill « traiter une mission », dans cet ordre strict :
  1. `take` ;
  2. contrôle de fraîcheur (`git diff --name-only <commit>..HEAD -- <files>`) puis `mission_freshness` ;
  3. **présenter le prompt et le résultat du contrôle à l'utilisateur, et attendre son accord** ;
  4. exécuter ;
  5. vérifier les critères d'acceptation ;
  6. `complete` avec mesures, ou `drop` avec raison.
  En cas d'interruption : `release`.
- Skill « créer des missions » : une mission = un objectif vérifiable ; gabarit complet ; commit et fichiers renseignés ; un lot (`batchId`) par analyse.
- Le hook `UserPromptSubmit` existant fait aussi le heartbeat de la mission en cours.
- Scénario de test réel dans `TESTING.md` :
  - une session crée 3 missions depuis un audit ;
  - deux sessions font `next perf` en même temps → missions distinctes ;
  - une mission avec un fichier modifié → la fraîcheur est signalée ;
  - un `complete` → le résultat apparaît dans l'UI.

# 10.4 — UI
- Sidebar : entrée « Missions » (compteur des missions à traiter) sur tous les écrans.
- File (maquettes 31–33) :
  - bloc « Origine » quand la file est filtrée par lot ;
  - filtres dans l'URL ;
  - colonnes et sous-lignes de statut conformes à SPEC §8.4.
- Détail (maquettes 34–39) :
  - frise du cycle de vie, bandeaux validation et fraîcheur, prompt rendu (sanitisé) ;
  - résultat avec métriques avant → après ;
  - panneaux latéraux selon le statut ;
  - actions de l'en-tête selon le statut, avec confirmation pour Rejeter, Abandonner et Libérer.
- « Proposer comme contexte » sur une mission terminée : ouvre l'éditeur, prérempli à partir du résultat.
- Mocks : étendre l'adapter in-memory et `?mock=` (`missions-empty`).
- Tests : filtres, actions par statut, rendu du résultat, frise.
- Fin : `auditing-architecture` + `auditing-performance`, rapport P0→P3, correction des P0/P1, tableau des écarts avec les maquettes 31–39. Stop.

# Hors périmètre
Dépendances entre missions, assignation à une personne, pont vers Jira, notifications externes. À ajouter dans `ROADMAP.md`.
