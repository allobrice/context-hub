# Context Hub serveur (`apps/server`)

Serveur Node (Hono) : API REST `/api/*` pour l'UI, serveur MCP Streamable HTTP `/mcp` pour les sessions Claude Code, persistance SQLite (Drizzle). Règles communes : `CLAUDE.md` racine.

> Squelette : le serveur est construit aux phases 2 (persistance), 3 (REST) et 4 (MCP). Ce fichier sera complété à chaque phase.

## Couches prévues

`interfaces/http` et `interfaces/mcp` → `application` (cas d'usage, ports, sans Hono ni Drizzle) → `@context-hub/domain` ; `infrastructure/db` implémente les ports. Seul `src/main.ts` assemble.
