CREATE TABLE `workspace_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`repo` text NOT NULL,
	`area` text NOT NULL,
	`holder_user_id` text NOT NULL,
	`holder_session_label` text NOT NULL,
	`holder_repo` text,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ttl_minutes` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workspace_claims_lookup_idx` ON `workspace_claims` (`workspace_id`,`repo`,`expires_at`);--> statement-breakpoint
CREATE INDEX `workspace_claims_holder_idx` ON `workspace_claims` (`workspace_id`,`holder_user_id`,`holder_session_label`);--> statement-breakpoint
CREATE INDEX `workspace_claims_expires_idx` ON `workspace_claims` (`expires_at`);--> statement-breakpoint
CREATE TABLE `workspace_entries` (
	`workspace_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`author_user_id` text,
	`author_session_label` text,
	`author_repo` text,
	`system_source` text,
	`redactions` integer DEFAULT 0 NOT NULL,
	`suspicious` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `seq`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workspace_entries_kind_idx` ON `workspace_entries` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `workspace_linked_contexts` (
	`workspace_id` text NOT NULL,
	`context_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `context_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_participants` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_label` text NOT NULL,
	`repo` text,
	`joined_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`cursor` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `session_label`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`goal` text NOT NULL,
	`status` text NOT NULL,
	`repos` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`closed_at` text,
	`closed_by` text,
	`next_seq` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE INDEX `workspaces_status_activity_idx` ON `workspaces` (`status`,`last_activity_at`);