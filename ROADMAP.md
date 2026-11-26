# Roadmap : hors périmètre de la v1

Volontairement exclus de la v1 (mission « serveur + MCP + branchement de l'UI ») :

- **Postgres** : le schéma Drizzle reste portable (types `text`/`integer`, dates ISO). Seuls la recherche plein texte (FTS5, derrière une interface) et le trigger d'immuabilité des versions sont propres à SQLite.
- **Docker** et conteneurisation.
- **Déploiement** (hébergement, TLS, nom de domaine, sauvegardes de la base).
- **OAuth** : la v1 authentifie par jeton Bearer (hash sha-256 en base). L'UI ne s'authentifie qu'en dev, via le proxy Vite qui injecte le jeton côté Node.
- **Multi-équipes** : une seule équipe en v1 ; la portée `team` est visible par tout utilisateur authentifié.
- **Diff entre versions** (« Comparer… » reste désactivé avec tooltip).
- **Plusieurs instances du serveur** : le bus `ContextEvents` et les sessions MCP 2025 vivent en mémoire d'un processus. Au-delà d'une instance : pub/sub partagé (`ServerEventBus` du SDK) et sessions collantes, ou clients 2026-07-28 uniquement (sans état).
- **Expiration des sessions MCP inactives** : v1 = plafond de sessions et fermeture par le client (`DELETE`).
- **Validation du Host sur `/api/*`** : appliquée sur `/mcp` (DNS rebinding) ; l'API est protégée par le jeton Bearer et CORS.
- **Authentification de l'UI hors dev** : en v1 le jeton n'est injecté que par le proxy Vite ; une UI déployée demandera une session (OAuth / cookie) côté serveur.

## Workspaces : hors périmètre (phases 7 à 9)

- **Tâches avec dépendances** (`Task`) entre sessions.
- **Artefacts versionnés** (`Artifact`) attachés à un workspace.
- **Rôles par plateforme** (intégration de Zeus) : en v1, tout membre peut inviter, écrire, réserver, libérer de force et fermer.
- **SSE ou WebSocket** pour l'UI : la v1 fait du polling (`GET /entries?since=`).
- **Notifications externes** (Slack…).
- **`notifications/resources/updated` pour les clients 2026-07-28** : le bus du SDK (`handler.notify.resourceUpdated`) diffuse à tout flux abonné à l'URI sans contrôle d'appartenance ; seules les sessions 2025 membres et abonnées sont notifiées.
- **Plusieurs instances** : la déduplication des entrées de blocage (`check-write`) vit en mémoire du processus, comme les bus d'évènements.

## Missions : hors périmètre (phase 10)

- **Dépendances entre missions** (une mission débloquée par la fin d'une autre).
- **Assignation à une personne** : une mission est prise par la première session qui la demande.
- **Pont vers Jira** (création ou synchronisation de tickets).
- **Notifications externes** (Slack…) à la création, à la validation ou à la fin d'une mission.
- **Rattachement à un workspace** : `workspaceId` existe dans le modèle (SPEC §8.1) mais reste `null` en v1 (ni l'API ni le MCP ne le renseignent).
- **Plusieurs instances** : le balayage de l'échu est fait dans la transaction de chaque `take` et par la maintenance horaire du processus ; avec Postgres, `next` passera par `SELECT … FOR UPDATE SKIP LOCKED`.

## Risques résiduels acceptés en v1 (audit phase 6, P3)

- Le slug est unique pour tout l'espace : `slug-taken` révèle qu'un slug existe, même dans un contexte personnel d'autrui. Les noms de tags du registre et l'aperçu de fusion portent aussi sur tous les contextes ; renommer ou supprimer un tag modifie les contextes personnels d'autrui (la taxonomie est commune).
- Les tags saisis dans un brouillon ne sont pas validés par `isValidTagName` (ils le sont par la taxonomie).
- Un faux positif est identifié par `ligne + motif` : il couvre tous les secrets du même motif sur la même ligne.
- Pas d'expiration des sessions MCP inactives (plafonds par utilisateur et global seulement).
- Workspaces : un non-membre reçoit 403 `WORKSPACE_FORBIDDEN`, ce qui révèle qu'un slug de workspace existe (maquette 30, voulu par la SPEC).
