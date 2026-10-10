// 数研 MathFlow 数据模型。
//
// 设计要点：每个学生、每次提交、每次审核都是独立的一行，按主键更新。
// 不要退回到「一个用户一个 JSON 大包」的做法：那样多个学生同时提交会互相
// 覆盖，也无法做到学生只能看见自己的数据。
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Preserve the old table in migration metadata; the new teaching flow does not use it.
export const workspaces = sqliteTable('workspaces', {
  owner: text('owner').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(0),
});

/** 身份由平台的登录头提供；本表只保存角色和显示名。 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  role: text('role').notNull().default('student'),
  displayName: text('display_name').notNull(),
  email: text('email'),
  createdAt: text('created_at').notNull(),
});

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  teacherId: text('teacher_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  term: text('term'),
  joinCode: text('join_code').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('courses_join_code_unique').on(table.joinCode),
  index('courses_teacher_idx').on(table.teacherId),
]);

export const enrollments = sqliteTable('enrollments', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  studentId: text('student_id').notNull(),
  studentNumber: text('student_number'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  // 同一学生对同一课程只能有一条选课记录。
  uniqueIndex('enrollments_course_student_unique').on(table.courseId, table.studentId),
  index('enrollments_student_idx').on(table.studentId),
]);

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  title: text('title').notNull(),
  chapter: text('chapter'),
  due: text('due').notNull(),
  maxScore: integer('max_score').notNull(),
  weight: real('weight').notNull().default(1),
  questions: text('questions').notNull(),
  rubric: text('rubric').notNull(),
  sequence: integer('sequence').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('assignments_course_idx').on(table.courseId),
]);

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull(),
  courseId: text('course_id').notNull(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  studentNumber: text('student_number'),
  files: text('files').notNull().default('[]'),
  status: text('status').notNull().default('pending'),
  aiScore: real('ai_score'),
  aiPayload: text('ai_payload'),
  finalScore: real('final_score'),
  finalFeedback: text('final_feedback'),
  category: text('category'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  submittedAt: text('submitted_at').notNull(),
}, (table) => [
  // 一次作业，一位学生只有一份提交；重复提交在同一条记录上更新。
  uniqueIndex('submissions_assignment_student_unique').on(table.assignmentId, table.studentId),
  index('submissions_course_idx').on(table.courseId),
  index('submissions_student_idx').on(table.studentId),
]);

export type UserRow = typeof users.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type EnrollmentRow = typeof enrollments.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;

export const tutorMessages = sqliteTable('tutor_messages', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull(),
  studentId: text('student_id').notNull(),
  answer: text('answer').notNull(),
  feedback: text('feedback').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('tutor_submission_idx').on(table.submissionId)]);
