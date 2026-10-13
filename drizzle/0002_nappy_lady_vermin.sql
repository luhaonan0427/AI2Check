CREATE UNIQUE INDEX `enrollment_membership` ON `enrollments` (`class_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `enrollment_user` ON `enrollments` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_assignment_student` ON `submissions` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `submission_student` ON `submissions` (`student_id`);