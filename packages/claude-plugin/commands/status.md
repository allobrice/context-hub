---
description: État du workspace Context Hub de cette session (mes zones, entrées non lues)
disable-model-invocation: true
---

Le hook du plugin context-hub a traité `/context-hub:status` avant ce message. Son compte rendu se trouve dans le contexte, entre les balises `<context-hub>`.

Restitue-le tel quel, en 6 lignes au plus : workspace et label, statut, sessions actives, mes zones réservées avec leur échéance, nombre d'entrées non lues. S'il y a des entrées non lues, propose de les lire avec `workspace_read` ; ne les lis pas sans accord.

Si aucun compte rendu `<context-hub>` n'est présent, les hooks du plugin ne sont pas actifs : dis-le.
