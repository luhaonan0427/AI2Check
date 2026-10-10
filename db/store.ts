// 数据访问层。
//
// 与旧实现的区别：每个学生每份提交都是独立的一行，按主键更新，不再整包覆盖。
// 因此多个学生同时提交不会互相冲突；权限判断集中在这里，不在界面里。
import { env } from 'cloudflare:workers';
import type {
  Assignment,
  Category,
  Course,
  Enrollment,
  Grade,
  Role,
  Submission,
  SubmissionStatus,
  User,
} from '@/app/domain';
import { classify } from '@/app/domain';
import { badRequest, forbidden, notFound } from '@/app/api/shared';

type D1 = D1Database;

export function database(): D1 {
  if (!env.DB) throw new Error('数据库暂不可用，请稍后重试');
  return env.DB;
}

export function bucket() {
  if (!env.BUCKET) throw new Error('图片存储暂不可用，请稍后重试');
  return env.BUCKET;
}

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomJoinCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  return out;
}

// ---------------------------------------------------------------- 类型转换

type Row = Record<string, unknown>;

function toUser(row: Row): User {
  return {
    id: String(row.id),
    role: row.role === 'teacher' ? 'teacher' : 'student',
    displayName: String(row.display_name),
    email: row.email == null ? null : String(row.email),
  };
}

function toCourse(row: Row): Course {
  return {
    id: String(row.id),
    teacherId: String(row.teacher_id),
    name: String(row.name),
    code: String(row.code),
    term: row.term == null ? null : String(row.term),
    joinCode: String(row.join_code),
    createdAt: String(row.created_at),
  };
}

function toAssignment(row: Row): Assignment {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    title: String(row.title),
    chapter: row.chapter == null ? null : String(row.chapter),
    due: String(row.due),
    maxScore: Number(row.max_score),
    weight: Number(row.weight),
    questions: String(row.questions),
    rubric: String(row.rubric),
    sequence: Number(row.sequence),
    createdAt: String(row.created_at),
  };
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toSubmission(row: Row): Submission {
  const status = String(row.status) as SubmissionStatus;
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    courseId: String(row.course_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    studentNumber: row.student_number == null ? null : String(row.student_number),
    files: safeJson<string[]>(row.files, []),
    status: status === 'graded' || status === 'approved' ? status : 'pending',
    aiScore: row.ai_score == null ? null : Number(row.ai_score),
    aiPayload: safeJson<Grade | null>(row.ai_payload, null),
    finalScore: row.final_score == null ? null : Number(row.final_score),
    finalFeedback: row.final_feedback == null ? null : String(row.final_feedback),
    category: row.category == null ? null : (String(row.category) as Category),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
    submittedAt: String(row.submitted_at),
  };
}

// ---------------------------------------------------------------- 用户与角色

/**
 * 第一次出现时建档。教师由服务端 TEACHER_EMAILS 授权，其余默认为学生。
 * 之后角色保存在 users.role，前端无法自行提权。
 */
export async function ensureUser(input: {
  id: string;
  displayName: string;
  email: string | null;
}): Promise<User> {
  const db = database();
  const existing = await db
    .prepare('SELECT * FROM users WHERE id=?')
    .bind(input.id)
    .first<Row>();
  if (existing) {
    // 显示名可能变化，保持同步但不改角色。
    if (String(existing.display_name) !== input.displayName && input.displayName) {
      await db
        .prepare('UPDATE users SET display_name=?, email=? WHERE id=?')
        .bind(input.displayName, input.email, input.id)
        .run();
    }
    return { ...toUser(existing), displayName: input.displayName || toUser(existing).displayName };
  }

  const teachers = (env.TEACHER_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  const role: Role = input.email && teachers.includes(input.email.toLowerCase()) ? 'teacher' : 'student';

  await db
    .prepare('INSERT INTO users (id,role,display_name,email,created_at) VALUES (?,?,?,?,?)')
    .bind(input.id, role, input.displayName, input.email, now())
    .run();

  return { id: input.id, role, displayName: input.displayName, email: input.email };
}

export async function findUser(userId: string): Promise<User | null> {
  const row = await database().prepare('SELECT * FROM users WHERE id=?').bind(userId).first<Row>();
  return row ? toUser(row) : null;
}

export async function setRole(userId: string, role: Role): Promise<void> {
  await database().prepare('UPDATE users SET role=? WHERE id=?').bind(role, userId).run();
}

// ---------------------------------------------------------------- 课程

export async function createCourse(input: {
  teacherId: string;
  name: string;
  code: string;
  term?: string | null;
}): Promise<Course> {
  const db = database();
  // join_code 有唯一索引；极小概率撞号时重试。
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const joinCode = randomJoinCode();
    const courseId = id();
    try {
      await db
        .prepare(
          'INSERT INTO courses (id,teacher_id,name,code,term,join_code,created_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(courseId, input.teacherId, input.name, input.code, input.term ?? null, joinCode, now())
        .run();
      return {
        id: courseId,
        teacherId: input.teacherId,
        name: input.name,
        code: input.code,
        term: input.term ?? null,
        joinCode,
        createdAt: now(),
      };
    } catch (error) {
      if (attempt === 5) throw error;
    }
  }
  throw new Error('无法生成课程码，请重试');
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const row = await database()
    .prepare('SELECT * FROM courses WHERE id=?')
    .bind(courseId)
    .first<Row>();
  return row ? toCourse(row) : null;
}

export async function findCourseByJoinCode(joinCode: string): Promise<Course | null> {
  const row = await database()
    .prepare('SELECT * FROM courses WHERE join_code=?')
    .bind(joinCode.trim().toUpperCase())
    .first<Row>();
  return row ? toCourse(row) : null;
}

export async function listTeacherCourses(teacherId: string): Promise<Course[]> {
  const { results } = await database()
    .prepare('SELECT * FROM courses WHERE teacher_id=? ORDER BY created_at DESC')
    .bind(teacherId)
    .all<Row>();
  return (results ?? []).map(toCourse);
}

export async function listStudentCourses(studentId: string): Promise<Course[]> {
  const { results } = await database()
    .prepare(
      'SELECT c.* FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.student_id=? AND e.status=? ORDER BY c.created_at DESC',
    )
    .bind(studentId, 'active')
    .all<Row>();
  return (results ?? []).map(toCourse);
}

/** 课程归属校验：只有授课教师能改课程、发作业、审核、看全班数据。 */
export async function requireOwnedCourse(courseId: string, teacherId: string): Promise<Course> {
  const course = await getCourse(courseId);
  if (!course) throw notFound('课程不存在');
  if (course.teacherId !== teacherId) throw forbidden('只有授课教师可以执行此操作');
  return course;
}

export async function updateCourse(
  courseId: string,
  teacherId: string,
  patch: { name?: string; code?: string; term?: string | null },
): Promise<Course> {
  const course = await requireOwnedCourse(courseId, teacherId);
  await database()
    .prepare('UPDATE courses SET name=?, code=?, term=? WHERE id=?')
    .bind(patch.name ?? course.name, patch.code ?? course.code, patch.term === undefined ? course.term : patch.term, courseId)
    .run();
  return { ...course, ...patch } as Course;
}

export async function deleteCourse(courseId: string, teacherId: string): Promise<void> {
  await requireOwnedCourse(courseId, teacherId);
  // 逐条删除，不用 db.batch()：本地 Miniflare 下 batch 会报
  // SQLITE_CANTOPEN，且 D1 本来也不支持事务，逐条更可靠。
  await removeSubmissionFiles(courseId);
  for (const statement of [
    'DELETE FROM tutor_messages WHERE submission_id IN (SELECT id FROM submissions WHERE course_id=?)',
    'DELETE FROM submissions WHERE course_id=?',
    'DELETE FROM assignments WHERE course_id=?',
    'DELETE FROM enrollments WHERE course_id=?',
    'DELETE FROM courses WHERE id=?',
  ]) {
    await database().prepare(statement).bind(courseId).run();
  }
}

/** 删除课程下所有提交时，一并清理 R2 里的原图，避免留下孤儿文件。 */
async function removeSubmissionFiles(courseId: string): Promise<void> {
  if (!env.BUCKET) return;
  const { results } = await database()
    .prepare('SELECT student_id, files FROM submissions WHERE course_id=?')
    .bind(courseId)
    .all<{ student_id: string; files: string }>();
  for (const row of results ?? []) {
    for (const fileId of safeJson<string[]>(row.files, [])) {
      if (!/^[a-f0-9-]{36}$/.test(fileId)) continue;
      try {
        await env.BUCKET.delete(`${row.student_id}/${fileId}`);
      } catch {
        // 清理失败不应阻断删除课程。
      }
    }
  }
}

// ---------------------------------------------------------------- 选课

export async function enroll(input: {
  courseId: string;
  studentId: string;
  studentNumber?: string | null;
}): Promise<Enrollment> {
  const db = database();
  const existing = await db
    .prepare('SELECT * FROM enrollments WHERE course_id=? AND student_id=?')
    .bind(input.courseId, input.studentId)
    .first<Row>();
  if (existing) {
    if (String(existing.status) !== 'active') {
      await db
        .prepare('UPDATE enrollments SET status=? WHERE id=?')
        .bind('active', String(existing.id))
        .run();
    }
    return {
      id: String(existing.id),
      courseId: input.courseId,
      studentId: input.studentId,
      studentNumber:
        input.studentNumber ?? (existing.student_number == null ? null : String(existing.student_number)),
      status: 'active',
      createdAt: String(existing.created_at),
    };
  }
  const enrollmentId = id();
  await db
    .prepare(
      'INSERT INTO enrollments (id,course_id,student_id,student_number,status,created_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(enrollmentId, input.courseId, input.studentId, input.studentNumber ?? null, 'active', now())
    .run();
  return {
    id: enrollmentId,
    courseId: input.courseId,
    studentId: input.studentId,
    studentNumber: input.studentNumber ?? null,
    status: 'active',
    createdAt: now(),
  };
}

export async function getEnrollment(courseId: string, studentId: string): Promise<Enrollment | null> {
  const row = await database()
    .prepare('SELECT * FROM enrollments WHERE course_id=? AND student_id=? AND status=?')
    .bind(courseId, studentId, 'active')
    .first<Row>();
  if (!row) return null;
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    studentId: String(row.student_id),
    studentNumber: row.student_number == null ? null : String(row.student_number),
    status: String(row.status),
    createdAt: String(row.created_at),
  };
}

export async function requireEnrollment(courseId: string, studentId: string): Promise<Enrollment> {
  const enrollment = await getEnrollment(courseId, studentId);
  if (!enrollment) throw forbidden('你还没有加入这门课程');
  return enrollment;
}

export async function listCourseStudents(courseId: string) {
  const { results } = await database()
    .prepare(
      'SELECT e.student_id, e.student_number, COALESCE(u.display_name, e.student_id) AS display_name FROM enrollments e LEFT JOIN users u ON u.id=e.student_id WHERE e.course_id=? AND e.status=? ORDER BY e.created_at',
    )
    .bind(courseId, 'active')
    .all<Row>();
  return (results ?? []).map((row) => ({
    studentId: String(row.student_id),
    studentNumber: row.student_number == null ? null : String(row.student_number),
    displayName: String(row.display_name),
  }));
}

// ---------------------------------------------------------------- 作业

export async function listAssignments(courseId: string): Promise<Assignment[]> {
  const { results } = await database()
    .prepare('SELECT * FROM assignments WHERE course_id=? ORDER BY sequence DESC, created_at DESC')
    .bind(courseId)
    .all<Row>();
  return (results ?? []).map(toAssignment);
}

export async function getAssignment(assignmentId: string): Promise<Assignment | null> {
  const row = await database()
    .prepare('SELECT * FROM assignments WHERE id=?')
    .bind(assignmentId)
    .first<Row>();
  return row ? toAssignment(row) : null;
}

export async function createAssignment(input: {
  courseId: string;
  teacherId: string;
  title: string;
  chapter?: string | null;
  due: string;
  maxScore: number;
  weight: number;
  questions: string;
  rubric: string;
}): Promise<Assignment> {
  await requireOwnedCourse(input.courseId, input.teacherId);
  if (!Number.isFinite(Date.parse(input.due))) throw badRequest('截止时间无效');

  const db = database();
  const next = await db
    .prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM assignments WHERE course_id=?')
    .bind(input.courseId)
    .first<{ n: number }>();
  const assignmentId = id();
  await db
    .prepare(
      'INSERT INTO assignments (id,course_id,title,chapter,due,max_score,weight,questions,rubric,sequence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      assignmentId,
      input.courseId,
      input.title,
      input.chapter ?? null,
      input.due,
      input.maxScore,
      input.weight,
      input.questions,
      input.rubric,
      next?.n ?? 1,
      now(),
    )
    .run();
  return (await getAssignment(assignmentId))!;
}

export async function deleteAssignment(assignmentId: string, teacherId: string): Promise<void> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw notFound('作业不存在');
  await requireOwnedCourse(assignment.courseId, teacherId);
  await removeAssignmentFiles(assignmentId);
  await database().prepare('DELETE FROM tutor_messages WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id=?)').bind(assignmentId).run();
  // 同样逐条删除，避免本地 Miniflare 的 batch 问题。
  await database().prepare('DELETE FROM submissions WHERE assignment_id=?').bind(assignmentId).run();
  await database().prepare('DELETE FROM assignments WHERE id=?').bind(assignmentId).run();
}

/** 删除作业时清理对应提交在原图存储里的文件。 */
async function removeAssignmentFiles(assignmentId: string): Promise<void> {
  if (!env.BUCKET) return;
  const { results } = await database()
    .prepare('SELECT student_id, files FROM submissions WHERE assignment_id=?')
    .bind(assignmentId)
    .all<{ student_id: string; files: string }>();
  for (const row of results ?? []) {
    for (const fileId of safeJson<string[]>(row.files, [])) {
      if (!/^[a-f0-9-]{36}$/.test(fileId)) continue;
      try {
        await env.BUCKET.delete(`${row.student_id}/${fileId}`);
      } catch {
        // 清理失败不应阻断删除作业。
      }
    }
  }
}

// ---------------------------------------------------------------- 提交

export async function listSubmissionsByCourse(courseId: string): Promise<Submission[]> {
  const { results } = await database()
    .prepare('SELECT * FROM submissions WHERE course_id=? ORDER BY submitted_at DESC')
    .bind(courseId)
    .all<Row>();
  return (results ?? []).map(toSubmission);
}

export async function listSubmissionsByStudent(studentId: string): Promise<Submission[]> {
  const { results } = await database()
    .prepare('SELECT * FROM submissions WHERE student_id=? ORDER BY submitted_at DESC')
    .bind(studentId)
    .all<Row>();
  return (results ?? []).map(toSubmission);
}

export async function listSubmissionsByAssignment(assignmentId: string): Promise<Submission[]> {
  const { results } = await database()
    .prepare('SELECT * FROM submissions WHERE assignment_id=? ORDER BY submitted_at DESC')
    .bind(assignmentId)
    .all<Row>();
  return (results ?? []).map(toSubmission);
}

export async function getSubmission(submissionId: string): Promise<Submission | null> {
  const row = await database()
    .prepare('SELECT * FROM submissions WHERE id=?')
    .bind(submissionId)
    .first<Row>();
  return row ? toSubmission(row) : null;
}

export async function findSubmission(
  assignmentId: string,
  studentId: string,
): Promise<Submission | null> {
  const row = await database()
    .prepare('SELECT * FROM submissions WHERE assignment_id=? AND student_id=?')
    .bind(assignmentId, studentId)
    .first<Row>();
  return row ? toSubmission(row) : null;
}

/** 学生提交照片。同一学生同一作业只有一行，重复提交覆盖原记录并重新批改。 */
export async function upsertSubmission(input: {
  assignment: Assignment;
  studentId: string;
  studentName: string;
  studentNumber?: string | null;
  files: string[];
  grade: Grade | null;
}): Promise<Submission> {
  const db = database();
  const existing = await findSubmission(input.assignment.id, input.studentId);
  const status: SubmissionStatus = input.grade ? 'graded' : 'pending';

  if (existing) {
    await db
      .prepare(
        'UPDATE submissions SET files=?, status=?, ai_score=?, ai_payload=?, final_score=NULL, final_feedback=NULL, category=?, reviewed_by=NULL, reviewed_at=NULL, submitted_at=? WHERE id=?',
      )
      .bind(
        JSON.stringify(input.files),
        status,
        input.grade?.score ?? null,
        input.grade ? JSON.stringify(input.grade) : null,
        input.grade?.category ?? null,
        now(),
        existing.id,
      )
      .run();
    return (await getSubmission(existing.id))!;
  }

  const submissionId = id();
  await db
    .prepare(
      'INSERT INTO submissions (id,assignment_id,course_id,student_id,student_name,student_number,files,status,ai_score,ai_payload,category,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      submissionId,
      input.assignment.id,
      input.assignment.courseId,
      input.studentId,
      input.studentName,
      input.studentNumber ?? null,
      JSON.stringify(input.files),
      status,
      input.grade?.score ?? null,
      input.grade ? JSON.stringify(input.grade) : null,
      input.grade?.category ?? null,
      now(),
    )
    .run();
  return (await getSubmission(submissionId))!;
}

/**
 * 教师审核。可以接受或修改批改建议分；同时写入定稿反馈与分级。
 * 只有授课教师能调用，且只能改自己课程下的提交。
 */
export async function reviewSubmission(input: {
  submissionId: string;
  teacherId: string;
  score: number;
  feedback: string;
}): Promise<Submission> {
  const submission = await getSubmission(input.submissionId);
  if (!submission) throw notFound('找不到提交记录');
  const assignment = await getAssignment(submission.assignmentId);
  if (!assignment) throw notFound('作业不存在');
  await requireOwnedCourse(assignment.courseId, input.teacherId);

  if (!Number.isFinite(input.score) || input.score < 0) throw badRequest('分数无效');
  if (input.score > assignment.maxScore) throw badRequest(`分数不能超过满分 ${assignment.maxScore}`);
  const feedback = input.feedback.trim();
  if (!feedback) throw badRequest('请填写反馈');

  await database()
    .prepare(
      'UPDATE submissions SET final_score=?, final_feedback=?, status=?, category=?, reviewed_by=?, reviewed_at=? WHERE id=?',
    )
    .bind(
      input.score,
      feedback,
      'approved',
      classify(input.score, assignment.maxScore),
      input.teacherId,
      now(),
      input.submissionId,
    )
    .run();
  return (await getSubmission(input.submissionId))!;
}

// ---------------------------------------------------------------- 统计

export type StudentRow = {
  studentId: string;
  displayName: string;
  studentNumber: string | null;
};

export type GradeEntry = {
  assignment: Assignment;
  submission: Submission | null;
  /** 用于统计的分数：已审核用定稿分，未审核用批改建议分。 */
  countedScore: number | null;
  approved: boolean;
};

export type StudentTotals = StudentRow & {
  entries: GradeEntry[];
  approvedCount: number;
  submittedCount: number;
  /** 已审核成绩的加权百分制均分（先按满分归一化再加权）。 */
  average: number | null;
  /** 全部作业都已被教师审核。 */
  complete: boolean;
};

/**
 * 多轮作业统计：先按每次作业满分归一化成百分制，再按 weight 加权。
 * 未提交、未审核都不计零；审核未完成时 average 是暂定值。
 */
export function computeTotals(
  students: StudentRow[],
  assignments: Assignment[],
  submissions: Submission[],
): StudentTotals[] {
  const byKey = new Map<string, Submission>();
  for (const submission of submissions) {
    byKey.set(`${submission.assignmentId}:${submission.studentId}`, submission);
  }

  return students.map((student) => {
    const entries: GradeEntry[] = assignments.map((assignment) => {
      const submission = byKey.get(`${assignment.id}:${student.studentId}`) ?? null;
      const approved = submission?.status === 'approved';
      return {
        assignment,
        submission,
        approved,
        countedScore: submission
          ? approved
            ? submission.finalScore
            : submission.aiScore
          : null,
      };
    });

    const approvedEntries = entries.filter((entry) => entry.approved && entry.countedScore != null);
    const weight = approvedEntries.reduce((total, entry) => total + entry.assignment.weight, 0);
    const average = weight
      ? approvedEntries.reduce(
          (total, entry) =>
            total + (entry.countedScore! / entry.assignment.maxScore) * 100 * entry.assignment.weight,
          0,
        ) / weight
      : null;

    return {
      ...student,
      entries,
      approvedCount: approvedEntries.length,
      submittedCount: entries.filter((entry) => entry.submission != null).length,
      average,
      complete: assignments.length > 0 && approvedEntries.length === assignments.length,
    };
  });
}

export async function courseTotals(courseId: string): Promise<StudentTotals[]> {
  const [students, assignments, submissions] = await Promise.all([
    listCourseStudents(courseId),
    listAssignments(courseId),
    listSubmissionsByCourse(courseId),
  ]);
  return computeTotals(students, assignments, submissions);
}

// ---------------------------------------------------------------- CSV

/** 转义 CSV 单元格，并阻断以公式字符开头的注入。 */
export function csvCell(value: string | number | null): string {
  let text = value == null ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
