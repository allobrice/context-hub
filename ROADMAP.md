# Roadmap : hors périmètre de la v1

Volontairement exclus de la v1 (mission « serveur + MCP + branchement de l'UI ») :

- **Postgres** : le schéma Drizzle reste portable (types `text`/`integer`, dates ISO). Seuls la recherche plein texte (FTS5, derrière une interface) et le trigger d'immuabilité des versions sont propres à SQLite.
- **Docker** et conteneurisation.
- **Déploiement** (hébergement, TLS, nom de domaine, sauvegardes de la base).
- **OAuth** : la v1 authentifie par jeton Bearer (hash sha-256 en base). L'UI ne s'authentifie qu'en dev, via le proxy Vite qui injecte le jeton côté Node.
- **Multi-équipes** : une seule équipe en v1 ; la portée `team` est visible par tout utilisateur authentifié.
- **Diff entre versions** (« Comparer… » reste désactivé avec tooltip).
