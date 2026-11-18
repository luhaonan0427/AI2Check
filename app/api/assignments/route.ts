import { createAssignment, deleteAssignment, getAssignment, listAssignments, requireOwnedCourse } from '@/db/store';
import { badRequest, checkOrigin, handleError, json, notFound, readJson, withRole } from '../shared';

export const dynamic = 'force-dynamic';

/** 教师端：某门课程的作业列表（用于新建后刷新）。 */
export async function GET(request: Request) {
  const result = await withRole('teacher');
  if (result.response) return result.response;
  try {
    const courseId = new URL(request.url).searchParams.get('courseId') ?? '';
    await requireOwnedCourse(courseId, result.user.id);
    return json({ assignments: await listAssignments(courseId) });
  } catch (error) {
    return handleError(error);
  }
}

/** 教师端：发布 / 删除作业。 */
export async function POST(request: Request) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const result = await withRole('teacher');
  if (result.response) return result.response;

  try {
    const body = await readJson(request);
    const op = String(body.op ?? 'create');

    if (op === 'create') {
      const title = String(body.title ?? '').trim();
      const questions = String(body.questions ?? '').trim();
      const rubric = String(body.rubric ?? '').trim();
      const due = String(body.due ?? '').trim();
      const maxScore = Number(body.maxScore ?? 100);
      const weight = Number(body.weight ?? 1);
      const chapter = body.chapter == null ? null : String(body.chapter).trim();

      if (title.length < 1 || title.length > 100) throw badRequest('作业标题需为 1-100 个字符');
      if (chapter && chapter.length > 100) throw badRequest('章节最多 100 个字符');
      if (questions.length < 1 || questions.length > 10000) throw badRequest('题目内容需为 1-10000 个字符');
      if (rubric.length < 1 || rubric.length > 10000) throw badRequest('评分标准需为 1-10000 个字符');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)) throw badRequest('截止时间格式不正确');
      if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) throw badRequest('满分需在 1-1000 之间');
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw badRequest('权重需在 0-100 之间');

      const assignment = await createAssignment({
        courseId: String(body.courseId ?? ''),
        teacherId: result.user.id,
        title,
        chapter,
        due,
        maxScore,
        weight,
        questions,
        rubric,
      });
      return json({ assignment });
    }

    if (op === 'delete') {
      const assignmentId = String(body.assignmentId ?? '');
      await deleteAssignment(assignmentId, result.user.id);
      return json({ ok: true });
    }

    if (op === 'get') {
      const assignment = await getAssignment(String(body.assignmentId ?? ''));
      if (!assignment) throw notFound('作业不存在');
      await requireOwnedCourse(assignment.courseId, result.user.id);
      return json({ assignment });
    }

    return json({ error: '未知操作' }, 400);
  } catch (error) {
    return handleError(error);
  }
}
