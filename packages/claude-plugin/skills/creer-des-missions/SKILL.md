---
name: creer-des-missions
description: Créer des missions Context Hub (mission_create) à partir d'une analyse de cette session — audit, revue, diagnostic — pour qu'une autre session, présente ou future, les traite. Une mission par objectif vérifiable, gabarit complet (Objectif, Constat chiffré daté avec commit, Fichiers, À faire, Critères d'acceptation), un batchId par analyse. À appliquer avec /context-hub:mission-create, ou quand l'utilisateur demande de transformer des constats en missions.
---

# Créer des missions Context Hub

Une mission est du travail préparé pour **une autre session**, qui la lira sans le contexte de celle-ci. Elle doit donc se suffire à elle-même.

## Avant de créer

- Propose la liste des missions envisagées à l'utilisateur (titre, priorité, tags, portée) et attends son accord. Ne crée rien de ta propre initiative.
- **Une mission = un objectif vérifiable.** Un audit avec quatre axes donne quatre missions, pas une.
- Relève le contexte du code : `git rev-parse HEAD` (commit) et les fichiers concernés (chemins relatifs à la racine du repo). Le repo `owner/name` est celui du compte rendu du hook (il tient compte de `CONTEXT_HUB_REPO`) ; à défaut, `git remote get-url origin`.

## Gabarit du prompt (refusé sinon)

Titres Markdown, dans cet ordre :

- `## Objectif` — le résultat attendu, en une ou deux phrases.
- `## Constat` — **chiffré, daté, avec le commit** (ex. « LCP mobile 3,8 s, Lighthouse du 25 nov., commit a41c9e2 »).
- `## Fichiers` — les fichiers en cause.
- `## À faire` — les étapes, concrètes.
- `## Critères d'acceptation` — vérifiables (mesures, tests, comportement).
- Facultatif : `## Contraintes`, `## Contextes liés`.

Le prompt fait au plus 8 000 caractères. **Aucun secret** (jeton, mot de passe, clé) ni consigne du type « ignore les instructions » : la mission serait refusée.

## Appel de `mission_create`

- `session` et `repo` : ceux que donne le compte rendu `<context-hub>` de `/context-hub:mission-create` (n'invente pas de label) ; `codeRepo` : le repo analysé s'il diffère ; `commit` et `files` : ceux du constat.
- `batchId` : **le même pour toutes les missions d'une même analyse** (ex. `audit-perf-home-2026-11-25`) et un `originLabel` lisible (ex. « Audit perf · page d'accueil Nuxt »).
- `priority` : P1 (bloquant ou fort gain), P2, P3 ; `tags` : quelques mots-clés en minuscules (ex. `perf`, `lcp`).
- `scope` : `personal` (prête tout de suite, pour soi), `team` (avec `team`) ou `project` : visibles de l'équipe, **validation humaine obligatoire** dans l'UI avant qu'une session puisse les prendre.

## Après

Donne la liste des missions créées : slug, statut (prête ou à valider), et `/context-hub:take <slug>`. En cas de refus (`MISSION_RULE`), corrige ce qui est signalé (sections manquantes, secret, champ invalide) et réessaie.
