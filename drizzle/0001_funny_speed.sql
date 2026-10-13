CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`number` text NOT NULL,
	`password` text NOT NULL,
	`recovery` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`teacher_request` text DEFAULT 'none' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`rubric` text NOT NULL,
	`deadline` integer NOT NULL,
	`max_score` integer NOT NULL,
	`weight` integer NOT NULL,
	`allow_late` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`open` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_code_unique` ON `classes` (`code`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`term` text NOT NULL,
	`description` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submission_history` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`snapshot` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`files` text NOT NULL,
	`answer` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`score` integer,
	`feedback` text NOT NULL,
	`submitted` integer NOT NULL,
	`reviewed` integer
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`assignment_id` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created` integer NOT NULL
);
