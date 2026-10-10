-- 数研 MathFlow：教师端 / 学生端真多用户数据模型。
--
-- 说明：本迁移只新增表，不修改也不删除既有的 workspaces 表，
-- 因此已经在用的教师空间数据不会被破坏。
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`term` text,
	`join_code` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_join_code_unique` ON `courses` (`join_code`);--> statement-breakpoint
CREATE INDEX `courses_teacher_idx` ON `courses` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_number` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_course_student_unique` ON `enrollments` (`course_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `enrollments_student_idx` ON `enrollments` (`student_id`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`chapter` text,
	`due` text NOT NULL,
	`max_score` integer NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`questions` text NOT NULL,
	`rubric` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assignments_course_idx` ON `assignments` (`course_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`course_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_name` text NOT NULL,
	`student_number` text,
	`files` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ai_score` real,
	`ai_payload` text,
	`final_score` real,
	`final_feedback` text,
	`category` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_assignment_student_unique` ON `submissions` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `submissions_course_idx` ON `submissions` (`course_id`);--> statement-breakpoint
CREATE INDEX `submissions_student_idx` ON `submissions` (`student_id`);
