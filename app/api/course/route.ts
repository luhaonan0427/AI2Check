import {
  createCourse,
  deleteCourse,
  enroll,
  findCourseByJoinCode,
  getCourse,
  listAssignments,
  listCourseStudents,
  listSubmissionsByCourse,
  listSubmissionsByStudent,
  requireEnrollment,
  requireOwnedCourse,
  updateCourse,
} from '@/db/store';
import { badRequest, checkOrigin, handleError, json, readJson, withUser } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * 课程接口统一入口（查询参数 ?id=，不用动态路由段）。
 *
 * GET   课程详情：教师看全班，学生只看自己
 * POST  按 op 分发：
 *       教师：create / update / delete
 *       学生：join（凭课程码加入）
 */
export async function GET(request: Request) {
  const result = await withUser();
  if (result.response) return result.response;
  const user = result.user;

  try {
    const courseId = new URL(request.url).searchParams.get('id') ?? '';
    if (!courseId) return json({ error: '缺少课程标识' }, 400);

    const course = await getCourse(courseId);
    if (!course) return json({ error: '课程不存在' }, 404);

    const assignments = await listAssignments(course.id);

    if (user.role === 'teacher') {
      if (course.teacherId !== user.id) return json({ error: '你不是这门课程的教师' }, 403);
      const [submissions, students] = await Promise.all([
        listSubmissionsByCourse(course.id),
        listCourseStudents(course.id),
      ]);
      return json({ course, role: 'teacher', assignments, submissions, students });
    }

    await requireEnrollment(course.id, user.id);
    const mine = (await listSubmissionsByStudent(user.id)).filter(
      (submission) => submission.courseId === course.id,
    );
    return json({ course, role: 'student', assignments, submissions: mine });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const result = await withUser();
  if (result.response) return result.response;
  const user = result.user;

  try {
    const body = await readJson(request);
    const op = String(body.op ?? '');

    // ---------------------------------------------------------- 学生：加入课程
    if (op === 'join') {
      if (user.role !== 'student') return json({ error: '教师账号无需加入课程' }, 403);
      const joinCode = String(body.joinCode ?? '').trim().toUpperCase();
      if (!joinCode) throw badRequest('请输入课程码');
      if (!/^[A-Z0-9]{4,10}$/.test(joinCode)) throw badRequest('课程码格式不正确');

      const target = await findCourseByJoinCode(joinCode);
      if (!target) throw badRequest('课程码无效，请向教师确认');

      const studentNumber = body.studentNumber == null ? null : String(body.studentNumber).trim();
      const enrollment = await enroll({
        courseId: target.id,
        studentId: user.id,
        studentNumber: studentNumber && studentNumber.length <= 30 ? studentNumber : null,
      });
      return json({ course: await getCourse(target.id), enrollment });
    }

    // ---------------------------------------------------------- 教师：课程管理
    if (user.role !== 'teacher') return json({ error: '需要教师权限' }, 403);

    if (op === 'create') {
      const name = String(body.name ?? '').trim();
      const code = String(body.code ?? '').trim();
      const term = body.term == null ? null : String(body.term).trim();
      if (!name || name.length > 60) throw badRequest('课程名称需为 1-60 个字符');
      if (!code || code.length > 30) throw badRequest('课程代码需为 1-30 个字符');
      const course = await createCourse({ teacherId: user.id, name, code, term });
      return json({ course });
    }

    if (op === 'update') {
      const course = await updateCourse(String(body.courseId ?? ''), user.id, {
        name: body.name == null ? undefined : String(body.name).trim(),
        code: body.code == null ? undefined : String(body.code).trim(),
        term: body.term === undefined ? undefined : body.term == null ? null : String(body.term).trim(),
      });
      return json({ course });
    }

    if (op === 'delete') {
      await deleteCourse(String(body.courseId ?? ''), user.id);
      return json({ ok: true });
    }

    if (op === 'check') {
      return json({ course: await requireOwnedCourse(String(body.courseId ?? ''), user.id) });
    }

    return json({ error: '未知操作' }, 400);
  } catch (error) {
    return handleError(error);
  }
}
