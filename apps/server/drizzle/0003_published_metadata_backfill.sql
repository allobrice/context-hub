-- Migration custom (audit de sécurité, phase 6). SQL propre à SQLite, isolé ici.

-- 1. Métadonnées publiées des contextes déjà publiés : celles en vigueur à la migration.
UPDATE `contexts` SET
	`published_title` = `title`,
	`published_description` = `description`,
	`published_collection_id` = `collection_id`,
	`published_scope_kind` = `scope_kind`,
	`published_scope_value` = `scope_value`,
	`published_tags` = coalesce((
		SELECT json_group_array(`tag_name`) FROM (
			SELECT `tag_name` FROM `context_tags`
			WHERE `context_tags`.`context_id` = `contexts`.`id`
			ORDER BY `position`
		)
	), '[]')
WHERE `published_version` IS NOT NULL;
--> statement-breakpoint
-- 2. Index plein texte en deux colonnes : courante (UI, brouillon compris) et publiée (MCP).
-- La recherche MCP ne lit que `published_text` : ni le contenu ni les métadonnées d'un brouillon.
-- L'index est reconstruit au démarrage s'il est vide (`ensureSearchIndex`).
DROP TABLE `context_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `context_search` USING fts5(
	`context_id` UNINDEXED,
	`current_text`,
	`published_text`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
-- 3. Une version publiée ne se supprime pas non plus.
CREATE TRIGGER `context_versions_undeletable`
BEFORE DELETE ON `context_versions`
BEGIN
	SELECT RAISE(ABORT, 'context_versions est immuable');
END;
