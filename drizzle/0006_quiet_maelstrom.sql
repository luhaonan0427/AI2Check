CREATE TABLE `campus_roster` (
	`class_id` text NOT NULL,
	`student_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_roster_membership` ON `campus_roster` (`class_id`,`student_id`);--> statement-breakpoint
ALTER TABLE `campus_accounts` ADD `must_change_password` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_assignments` ADD `ai_solution` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_assignments` ADD `solution_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_assignments` ADD `solution_claim` text;--> statement-breakpoint
ALTER TABLE `campus_assignments` ADD `solution_started` integer;