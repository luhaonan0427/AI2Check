// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{owner:text('owner').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const accounts=sqliteTable('accounts',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),name:text('name').notNull(),number:text('number').notNull(),
 password:text('password').notNull(),recovery:text('recovery').notNull(),role:text('role').notNull().default('student'),teacherRequest:text('teacher_request').notNull().default('none'),created:integer('created').notNull()
});
export const sessions=sqliteTable('sessions',{token:text('token').primaryKey(),userId:text('user_id').notNull(),expires:integer('expires').notNull()});
export const limits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const courses=sqliteTable('courses',{id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),term:text('term').notNull(),description:text('description').notNull(),created:integer('created').notNull()});
export const classes=sqliteTable('classes',{id:text('id').primaryKey(),courseId:text('course_id').notNull(),name:text('name').notNull(),code:text('code').notNull().unique(),open:integer('open').notNull().default(1)});
export const enrollments=sqliteTable('enrollments',{id:text('id').primaryKey(),classId:text('class_id').notNull(),userId:text('user_id').notNull(),status:text('status').notNull(),created:integer('created').notNull()},t=>[uniqueIndex('enrollment_membership').on(t.classId,t.userId),index('enrollment_user').on(t.userId)]);
export const assignments=sqliteTable('assignments',{id:text('id').primaryKey(),classId:text('class_id').notNull(),title:text('title').notNull(),body:text('body').notNull(),rubric:text('rubric').notNull(),deadline:integer('deadline').notNull(),maxScore:integer('max_score').notNull(),weight:integer('weight').notNull(),allowLate:integer('allow_late').notNull(),created:integer('created').notNull()});
export const submissions=sqliteTable('submissions',{id:text('id').primaryKey(),assignmentId:text('assignment_id').notNull(),studentId:text('student_id').notNull(),files:text('files').notNull(),answer:text('answer').notNull(),version:integer('version').notNull(),status:text('status').notNull(),score:integer('score'),feedback:text('feedback').notNull(),submitted:integer('submitted').notNull(),reviewed:integer('reviewed')},t=>[uniqueIndex('submission_assignment_student').on(t.assignmentId,t.studentId),index('submission_student').on(t.studentId)]);
export const history=sqliteTable('submission_history',{id:text('id').primaryKey(),submissionId:text('submission_id').notNull(),actor:text('actor').notNull(),event:text('event').notNull(),snapshot:text('snapshot').notNull(),created:integer('created').notNull()});
export const uploads=sqliteTable('uploads',{id:text('id').primaryKey(),owner:text('owner').notNull(),assignmentId:text('assignment_id').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),created:integer('created').notNull()});
