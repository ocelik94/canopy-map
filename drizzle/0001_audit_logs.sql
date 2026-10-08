CREATE TABLE `access_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`event` text NOT NULL,
	`username` text NOT NULL,
	`user_id` text,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_at` ON `access_log` (`at`);--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_at` ON `activity_log` (`at`);--> statement-breakpoint
CREATE INDEX `activity_entity` ON `activity_log` (`entity`,`entity_id`);