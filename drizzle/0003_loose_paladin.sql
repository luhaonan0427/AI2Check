CREATE TABLE `campus_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`number` text NOT NULL,
	`password` text NOT NULL,
	`recovery` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`teacher_request` text DEFAULT 'none' NOT NULL,
	`created` integer NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_accounts_username_unique` ON `campus_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `campus_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`rubric` text NOT NULL,
	`ai_solution` text DEFAULT '' NOT NULL,
	`solution_status` text DEFAULT 'pending' NOT NULL,
	`solution_claim` text,
	`solution_started` integer,
	`deadline` integer NOT NULL,
	`max_score` integer NOT NULL,
	`weight` real NOT NULL,
	`allow_late` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`open` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_classes_code_unique` ON `campus_classes` (`code`);--> statement-breakpoint
CREATE TABLE `campus_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`term` text NOT NULL,
	`description` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_enrollment_membership` ON `campus_enrollments` (`class_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `campus_enrollment_user` ON `campus_enrollments` (`user_id`);--> statement-breakpoint
CREATE TABLE `campus_submission_history` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`snapshot` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_roster` (
	`class_id` text NOT NULL,
	`student_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_roster_membership` ON `campus_roster` (`class_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `campus_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`files` text NOT NULL,
	`answer` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`score` real,
	`feedback` text NOT NULL,
	`ai_score` real,
	`ai_payload` text,
	`submitted` integer NOT NULL,
	`reviewed` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_submission_assignment_student` ON `campus_submissions` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `campus_submission_student` ON `campus_submissions` (`student_id`);--> statement-breakpoint
CREATE TABLE `campus_tutor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`version` integer NOT NULL,
	`student_id` text NOT NULL,
	`answer` text NOT NULL,
	`feedback` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campus_tutor_submission` ON `campus_tutor_messages` (`submission_id`,`version`,`created_at`);--> statement-breakpoint
CREATE TABLE `campus_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`assignment_id` text NOT NULL,
	`mime` text NOT NULL,
	`storage_key` text,
	`size` integer NOT NULL,
	`created` integer NOT NULL
);
