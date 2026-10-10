import { env } from 'cloudflare:workers';
import {
  getAssignment,
  getCourse,
  getSubmission,
  requireEnrollment,
  reviewSubmission,
  requireOwnedCourse,
  database,
  upsertSubmission,
} from '@/db/store';
import { gradeSubmission } from '@/app/grader';
import {
  badRequest,
  checkOrigin,
  handleError,
  json,
  notFound,
  readJson,
  withUser,
} from '../shared';

export const dynamic = 'force-dynamic';

/**
 * 提交接口统一入口（用查询参数 ?id=，不用动态路由段，避免吞掉无参数请求）。
 *
 * GET  单份提交：本人或该课程的授课教师可读，其他人 403
 * POST action=submit  学生提交作业照片（含批改）
 * POST action=review  教师审核定稿
 */
export async function GET(request: Request) {
  const result = await withUser();
  if (result.response) return result.response;
  const user = result.user;

  try {
    const submissionId = new URL(request.url).searchParams.get('id') ?? '';
    if (!submissionId) return json({ error: '缺少提交标识' }, 400);

    const submission = await getSubmission(submissionId);
    if (!submission) return json({ error: '找不到提交记录' }, 404);

    const assignment = await getAssignment(submission.assignmentId);
    let allowed = submission.studentId === user.id;

    if (!allowed && user.role === 'teacher') {
      const course = assignment ? await getCourse(assignment.courseId) : null;
      allowed = Boolean(course && course.teacherId === user.id);
    }
    if (!allowed) return json({ error: '无权查看这份提交' }, 403);

    return json({ submission, assignment });
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
    const action = String(body.action ?? 'submit');

    // ---------------------------------------------------------------- 学生提交
    if (action === 'submit') {
      if (user.role !== 'student') return json({ error: '只有学生可以提交作业' }, 403);
      if (!env.BUCKET) return json({ error: '图片存储暂不可用' }, 503);

      const assignmentId = String(body.assignmentId ?? '');
      const rawFiles = Array.isArray(body.files) ? body.files : [];
      if (!assignmentId) throw badRequest('缺少作业');
      if (rawFiles.length < 1) throw badRequest('请至少上传一张作业照片');
      if (rawFiles.length > 5) throw badRequest('最多上传 5 张照片');

      const fileIds = rawFiles.map((value) => String(value));
      for (const fileId of fileIds) {
        if (!/^[a-f0-9-]{36}$/.test(fileId)) throw badRequest('照片标识无效，请重新上传');
      }

      const assignment = await getAssignment(assignmentId);
      if (!assignment) throw notFound('作业不存在');

      const enrollment = await requireEnrollment(assignment.courseId, user.id);

      // 关键越权防护：照片必须存在于该学生自己的命名空间下。
      const files: { id: string; bytes: ArrayBuffer; contentType: string }[] = [];
      for (const fileId of fileIds) {
        const object = await env.BUCKET.get(`${user.id}/${fileId}`);
        if (!object) throw badRequest('未找到上传的照片，请重新上传');
        files.push({
          id: fileId,
          bytes: await object.arrayBuffer(),
          contentType: object.httpMetadata?.contentType ?? 'image/jpeg',
        });
      }

      const submission = await upsertSubmission({
        assignment,
        studentId: user.id,
        studentName: user.displayName,
        studentNumber: enrollment.studentNumber,
        files: fileIds,
        grade: null,
      });
      await database().prepare('DELETE FROM tutor_messages WHERE submission_id=?').bind(submission.id).run();
      try {
        const grade = await gradeSubmission({ assignment, studentId: user.id, files });
        await saveGrade(submission.id, submission.submittedAt, fileIds, grade);
        return json({ submission: await getSubmission(submission.id), placeholder: false });
      } catch {
        return json({ submission: await getSubmission(submission.id), placeholder: false,
          warning: '照片已保存，AI 批改暂不可用，可稍后重试或由教师手动审核。' });
      }
    }

    if (action === 'regrade') {
      const submission = await getSubmission(String(body.submissionId ?? ''));
      if (!submission) throw notFound('找不到提交记录');
      const assignment = await getAssignment(submission.assignmentId);
      if (!assignment) throw notFound('作业不存在');
      if (user.role === 'teacher') await requireOwnedCourse(assignment.courseId, user.id);
      else if (submission.studentId !== user.id) return json({ error: '无权批改此作业' }, 403);
      else await requireEnrollment(assignment.courseId, user.id);
      if (submission.status === 'approved') throw badRequest('已定稿作业无需重新批改，请联系教师调整');
      if (!env.BUCKET) return json({ error: '图片存储暂不可用' }, 503);
      const files = [];
      for (const id of submission.files) {
        const object = await env.BUCKET.get(`${submission.studentId}/${id}`);
        if (!object) throw badRequest('未找到原图');
        files.push({ id, bytes: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? 'image/jpeg' });
      }
      const grade = await gradeSubmission({ assignment, studentId: submission.studentId, files });
      await saveGrade(submission.id, submission.submittedAt, submission.files, grade);
      return json({ submission: await getSubmission(submission.id) });
    }

    // ---------------------------------------------------------------- 教师审核
    if (action === 'review') {
      if (user.role !== 'teacher') return json({ error: '需要教师权限' }, 403);
      const feedback = String(body.feedback ?? '').trim();
      if (feedback.length > 5000) throw badRequest('反馈最多 5000 个字符');

      const submission = await reviewSubmission({
        submissionId: String(body.submissionId ?? ''),
        teacherId: user.id,
        score: Number(body.score),
        feedback,
      });
      return json({ submission });
    }

    return json({ error: '未知操作' }, 400);
  } catch (error) {
    return handleError(error);
  }
}

async function saveGrade(id: string, submittedAt: string, files: string[], grade: import('@/app/domain').Grade) {
  // A late AI response must not overwrite a newer upload or teacher approval.
  await database().prepare('UPDATE submissions SET status=?, ai_score=?, ai_payload=?, category=? WHERE id=? AND submitted_at=? AND files=? AND status<>?')
    .bind('graded', grade.score, JSON.stringify(grade), grade.category, id, submittedAt, JSON.stringify(files), 'approved').run();
}
