import { checkOrigin, handleError, json, readJson, withRole } from '@/app/api/shared';
import { courseTotals, csvCell, listAssignments, requireOwnedCourse } from '@/db/store';

export const dynamic = 'force-dynamic';

/** 教师端：课程成绩统计（JSON）。 */
export async function GET(request: Request) {
  const result = await withRole('teacher');
  if (result.response) return result.response;
  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') ?? '';
    const course = await requireOwnedCourse(courseId, result.user.id);
    const [assignments, totals] = await Promise.all([listAssignments(courseId), courseTotals(courseId)]);
    return json({ course, assignments, totals });
  } catch (error) {
    return handleError(error);
  }
}

/** 教师端：导出 CSV。 */
export async function POST(request: Request) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const result = await withRole('teacher');
  if (result.response) return result.response;

  try {
    const body = await readJson(request);
    const courseId = String(body.courseId ?? '');
    // 仅用于校验归属：不是本课程的授课教师就直接拒绝，避免导出别人的成绩。
    await requireOwnedCourse(courseId, result.user.id);
    const [assignments, totals] = await Promise.all([listAssignments(courseId), courseTotals(courseId)]);

    const header = [
      '姓名',
      '学号',
      ...assignments.map((assignment) => assignment.title),
      '已审核加权均分',
      '已审核份数',
      '总评是否完整',
    ];

    const rows = totals.map((student) => [
      student.displayName,
      student.studentNumber ?? '',
      ...student.entries.map((entry) => {
        if (!entry.submission) return '未提交';
        if (entry.approved) return entry.countedScore ?? '';
        return entry.countedScore == null ? '待批改' : `待审核（建议 ${entry.countedScore}）`;
      }),
      student.average == null ? '' : student.average.toFixed(1),
      `${student.approvedCount}/${assignments.length}`,
      student.complete ? '完整' : '暂定',
    ]);

    // 带 BOM，保证 Excel 正确识别 UTF-8。
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="mathflow-grades.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
