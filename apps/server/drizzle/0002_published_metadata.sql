ALTER TABLE `contexts` ADD `published_title` text;--> statement-breakpoint
ALTER TABLE `contexts` ADD `published_description` text;--> statement-breakpoint
ALTER TABLE `contexts` ADD `published_collection_id` text REFERENCES collections(id);--> statement-breakpoint
ALTER TABLE `contexts` ADD `published_scope_kind` text;--> statement-breakpoint
ALTER TABLE `contexts` ADD `published_scope_value` text;--> statement-breakpoint
ALTER TABLE `contexts` ADD `published_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `contexts_published_scope_idx` ON `contexts` (`published_scope_kind`,`published_scope_value`);