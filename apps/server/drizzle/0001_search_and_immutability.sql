-- Migration custom (drizzle-kit generate --custom) : SQL propre à SQLite, isolé ici.
-- Portage Postgres : remplacer l'index FTS5 par une colonne tsvector + index GIN (voir
-- src/infrastructure/db/search/ContextSearchIndex.ts), et le trigger par un trigger plpgsql.

-- Index plein texte des contextes. Les colonnes publiées et brouillon sont séparées : la recherche MCP
-- ne porte que sur le contenu publié, pour qu'aucun terme de brouillon ne fuie.
CREATE VIRTUAL TABLE `context_search` USING fts5(
	`context_id` UNINDEXED,
	`title`,
	`description`,
	`slug`,
	`tags`,
	`published_content`,
	`draft_content`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
-- Défense en profondeur : une version publiée est immuable (SPEC §2).
CREATE TRIGGER `context_versions_immutable`
BEFORE UPDATE ON `context_versions`
BEGIN
	SELECT RAISE(ABORT, 'context_versions est immuable');
END;
