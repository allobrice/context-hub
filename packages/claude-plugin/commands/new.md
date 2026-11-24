---
description: Créer un workspace Context Hub et le rejoindre
argument-hint: '"<titre>" [label]'
disable-model-invocation: true
---

Le hook du plugin context-hub a traité `/context-hub:new $ARGUMENTS` avant ce message. Son compte rendu se trouve dans le contexte, entre les balises `<context-hub>`.

- En cas d'échec (slug déjà pris, serveur injoignable…), explique-le et propose une correction (autre titre, `/context-hub:join <slug>` si le workspace existe déjà).
- Sinon, confirme en 3 lignes : le slug créé, ton label de session, et la commande que les autres sessions doivent lancer (`/context-hub:join <slug>`). Rappelle que l'objectif et les repos se complètent dans l'UI Context Hub, et que les autres utilisateurs doivent y être invités.
- Si aucun compte rendu `<context-hub>` n'est présent, les hooks du plugin ne sont pas actifs : dis-le (vérifier `CONTEXT_HUB_TOKEN` et `/hooks`).
