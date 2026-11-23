CREATE TABLE `api_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `context_drafts` (
	`context_id` text PRIMARY KEY NOT NULL,
	`base_version` integer,
	`number` integer NOT NULL,
	`content` text NOT NULL,
	`note` text NOT NULL,
	`author_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`token_estimate` integer NOT NULL,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `context_tags` (
	`context_id` text NOT NULL,
	`tag_name` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`context_id`, `tag_name`),
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_name`) REFERENCES `tags`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `context_tags_tag_idx` ON `context_tags` (`tag_name`);--> statement-breakpoint
CREATE TABLE `context_versions` (
	`context_id` text NOT NULL,
	`number` integer NOT NULL,
	`content` text NOT NULL,
	`note` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	`token_estimate` integer NOT NULL,
	`false_positives` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`context_id`, `number`),
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`title_sort_key` text NOT NULL,
	`description` text NOT NULL,
	`collection_id` text,
	`scope_kind` text NOT NULL,
	`scope_value` text NOT NULL,
	`status` text NOT NULL,
	`published_version` integer,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contexts_slug_unique` ON `contexts` (`slug`);--> statement-breakpoint
CREATE INDEX `contexts_status_idx` ON `contexts` (`status`);--> statement-breakpoint
CREATE INDEX `contexts_updated_idx` ON `contexts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `contexts_scope_idx` ON `contexts` (`scope_kind`,`scope_value`);--> statement-breakpoint
CREATE INDEX `contexts_collection_idx` ON `contexts` (`collection_id`);--> statement-breakpoint
CREATE TABLE `mcp_reads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_id` text NOT NULL,
	`version` integer NOT NULL,
	`user_id` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_reads_context_at_idx` ON `mcp_reads` (`context_id`,`at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`name` text PRIMARY KEY NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
