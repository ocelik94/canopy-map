CREATE TABLE `applied_mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#1b5e20' NOT NULL,
	`icon` text DEFAULT '📍' NOT NULL,
	`device_type_id` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer NOT NULL,
	FOREIGN KEY (`device_type_id`) REFERENCES `device_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '📟' NOT NULL,
	`color` text DEFAULT '#1b5e20' NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`serial` text DEFAULT '' NOT NULL,
	`device_type_id` text NOT NULL,
	`category_id` text,
	`status_id` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`site_name` text DEFAULT '' NOT NULL,
	`site_group` text DEFAULT '' NOT NULL,
	`deployed_on` text,
	`last_service_on` text,
	`retrieval_due_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` integer,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devices_seq` ON `devices` (`seq`);--> statement-breakpoint
CREATE INDEX `devices_status` ON `devices` (`status_id`);--> statement-breakpoint
CREATE TABLE `location_history` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`site_name` text DEFAULT '' NOT NULL,
	`recorded_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lochist_device` ON `location_history` (`device_id`);--> statement-breakpoint
CREATE INDEX `lochist_seq` ON `location_history` (`seq`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`mime` text NOT NULL,
	`file` text NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`csrf_token` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`old_status_id` text,
	`new_status_id` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stathist_device` ON `status_history` (`device_id`);--> statement-breakpoint
CREATE INDEX `stathist_seq` ON `status_history` (`seq`);--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`key` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);