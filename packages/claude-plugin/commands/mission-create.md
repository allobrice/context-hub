---
description: Créer des missions Context Hub à partir du travail de cette session (une mission par objectif vérifiable)
argument-hint: '[ce qu’il faut transformer en missions]'
disable-model-invocation: true
---

Crée des missions Context Hub à partir de ce qui a été établi dans cette session (par exemple les axes d'amélioration d'un audit). Précision de l'utilisateur : $ARGUMENTS

Applique le skill `creer-des-missions` :

1. Propose d'abord à l'utilisateur la liste des missions envisagées (titre, priorité, tags, portée), **une par objectif vérifiable**, et attends son accord sur cette liste.
2. Récupère le commit analysé (`git rev-parse HEAD`). Le label de session et le repo à passer à `mission_create` sont dans le compte rendu du hook, entre les balises `<context-hub>` ; s'il est absent, les hooks ne sont pas actifs : demande-les à l'utilisateur.
3. Pour chaque mission validée, appelle `mission_create` avec le gabarit complet (Objectif, Constat chiffré et daté avec le commit, Fichiers, À faire, Critères d'acceptation), les fichiers analysés et un même `batchId` pour tout le lot.
4. Termine par la liste des missions créées : slug, statut (prête, ou à valider par un humain pour une portée équipe ou projet) et la commande `/context-hub:take <slug>`.
