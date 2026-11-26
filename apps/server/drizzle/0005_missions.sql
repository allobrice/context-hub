CREATE TABLE `mission_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mission_id` text NOT NULL,
	`mission_slug` text NOT NULL,
	`mission_title` text NOT NULL,
	`at` text NOT NULL,
	`type` text NOT NULL,
	`actor_user_id` text,
	`actor_session_label` text,
	`actor_repo` text,
	`actor_system` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `mission_events_mission_idx` ON `mission_events` (`mission_id`,`id`);--> statement-breakpoint
CREATE TABLE `mission_tags` (
	`mission_id` text NOT NULL,
	`tag` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`mission_id`, `tag`),
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mission_tags_tag_idx` ON `mission_tags` (`tag`,`mission_id`);--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`prompt` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_value` text NOT NULL,
	`origin_label` text NOT NULL,
	`origin_batch_id` text,
	`origin_user_id` text,
	`origin_session_label` text,
	`origin_repo` text,
	`created_by` text NOT NULL,
	`code_ref_repo` text NOT NULL,
	`code_ref_commit` text NOT NULL,
	`code_ref_files` text DEFAULT '[]' NOT NULL,
	`freshness_checked_at` text,
	`freshness_changed_files` text,
	`freshness_user_id` text,
	`freshness_session_label` text,
	`freshness_repo` text,
	`linked_context_ids` text DEFAULT '[]' NOT NULL,
	`workspace_id` text,
	`validation_by` text,
	`validation_at` text,
	`claim_user_id` text,
	`claim_session_label` text,
	`claim_repo` text,
	`claim_acquired_at` text,
	`claim_expires_at` text,
	`claim_token_hash` text,
	`result` text,
	`drop_reason` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`closed_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`origin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`freshness_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`validation_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `missions_slug_unique` ON `missions` (`slug`);--> statement-breakpoint
CREATE INDEX `missions_queue_idx` ON `missions` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `missions_expires_idx` ON `missions` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `missions_claim_expires_idx` ON `missions` (`claim_expires_at`);--> statement-breakpoint
CREATE INDEX `missions_holder_idx` ON `missions` (`claim_user_id`,`claim_session_label`);--> statement-breakpoint
CREATE INDEX `missions_batch_idx` ON `missions` (`origin_batch_id`);--> statement-breakpoint
CREATE INDEX `missions_repo_idx` ON `missions` (`code_ref_repo`);