---
description: Quitter le workspace Context Hub (libère mes zones et poste une passation)
disable-model-invocation: true
---

Le hook du plugin context-hub a traité `/context-hub:leave` avant ce message : il a libéré les zones de cette session et détaché la session du workspace. Son compte rendu se trouve dans le contexte, entre les balises `<context-hub>`.

1. Poste la passation demandée dans le compte rendu, avec `workspace_post` (`kind="handoff"`), en reprenant exactement le `slug` et la `session` qu'il indique. En 10 lignes au plus : ce qui est fait, ce qui reste à faire, les décisions prises, les fichiers concernés (champ `files`). N'y mets aucun secret.
2. Confirme ensuite en une ligne : zones libérées et passation publiée (n° d'entrée).

Si le compte rendu indique que la session n'avait rejoint aucun workspace, dis-le simplement, sans rien poster. Si aucun compte rendu `<context-hub>` n'est présent, les hooks du plugin ne sont pas actifs : dis-le.
