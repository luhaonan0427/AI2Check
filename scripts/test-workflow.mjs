// 端到端后端流程测试：教师发作业 → 学生提交 → 批改 → 教师审核 → 统计 → 越权拦截。
//
// 需要先启动本地开发服务： node scripts/run-framework.mjs dev
// 只应作用于本地开发数据库。
import assert from 'node:assert/strict';

const base = 'http://localhost:5173';

/** 以指定本地身份登录，取回会话 cookie。 */
async function signIn(identity) {
  const response = await fetch(`${base}/signin-with-chatgpt?as=${identity}&return_to=/`, {
    redirect: 'manual',
  });
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie, `本地登录应返回 cookie（${identity}）`);
  return { cookie, origin: base, 'Content-Type': 'application/json' };
}

async function call(headers, path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const get = (headers, path) => call(headers, path);
const post = (headers, path, payload) =>
  call(headers, path, { method: 'POST', body: JSON.stringify(payload) });

async function uploadPixel(headers) {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'page1.png');
  const response = await fetch(`${base}/api/files`, {
    method: 'POST',
    headers: { cookie: headers.cookie, origin: headers.origin },
    body: form,
  });
  assert.equal(response.status, 200, '图片上传应成功');
  return (await response.json()).id;
}

const results = [];
function step(name, detail) {
  results.push(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- 教师
const teacher = await signIn('teacher');
const teacherMe = await get(teacher, '/api/me');
assert.equal(teacherMe.status, 200, `教师应能读取自己的身份：${JSON.stringify(teacherMe.body)}`);
assert.equal(teacherMe.body.user.role, 'teacher', 'local_teacher 应被判定为教师');
step('教师登录并取得教师角色');

const createCourse = await post(teacher, '/api/course', {
  op: 'create',
  name: '数学分析 I',
  code: 'MATH 101',
  term: '2026 秋',
});
assert.equal(createCourse.status, 200, `创建课程应成功：${JSON.stringify(createCourse.body)}`);
const course = createCourse.body.course;
assert.match(course.joinCode, /^[A-Z0-9]{6}$/, '课程码应为 6 位');
step('教师创建课程', `课程码 ${course.joinCode}`);

const createAssignment = await post(teacher, '/api/assignments', {
  op: 'create',
  courseId: course.id,
  title: '第三次作业：极限与连续',
  chapter: '第二章 · 函数极限',
  due: '2026-10-01T23:59',
  maxScore: 100,
  weight: 1,
  questions:
    '1. 计算 lim(x→0) sin(x)/x，并说明使用的定理。\n2. 求方程 x² = x 的所有实数解，写出推导过程。\n3. 利用定义证明 f(x)=x² 在 x=1 处连续。',
  rubric: '第1题30分；第2题20分；第3题50分。认可正确的不同解法。',
});
assert.equal(createAssignment.status, 200, `发布作业应成功：${JSON.stringify(createAssignment.body)}`);
const assignment = createAssignment.body.assignment;
assert.equal(assignment.maxScore, 100);
step('教师发布作业');

const badScore = await post(teacher, '/api/assignments', {
  op: 'create',
  courseId: course.id,
  title: 'x',
  due: '2026-10-01T23:59',
  maxScore: 0,
  weight: 1,
  questions: 'q',
  rubric: 'r',
});
assert.equal(badScore.status, 400, '满分 0 应被拒绝');
step('非法分值被拒绝');

// ---------------------------------------------------------------- 学生 A
const studentA = await signIn('student_a');
const meA = await get(studentA, '/api/me');
assert.equal(meA.body.user.role, 'student', 'student_a 应为学生');
// 本地开发库可能残留此前运行的课程，因此只断言「本次这门课尚未加入」，
// 不假设数据库为空。需要完全干净的断言时请使用独立数据库。
assert.ok(
  !meA.body.courses.some((item) => item.id === createCourse.body.course.id),
  '此时学生 A 尚未加入本次创建的课程',
);
step('学生 A 登录，角色为学生');

const studentCreate = await post(studentA, '/api/course', { op: 'create', name: 'x', code: 'y' });
assert.equal(studentCreate.status, 403, '学生创建课程应被 403 拒绝');
step('学生创建课程被拒绝（403）');

const beforeJoin = await post(studentA, '/api/submission', {
  action: 'submit',
  assignmentId: assignment.id,
  files: ['00000000-0000-4000-8000-000000000000'],
});
assert.equal(beforeJoin.status, 403, '未选课不能提交');
step('未选课提交被拒绝（403）');

const badCode = await post(studentA, '/api/course', { op: 'join', joinCode: 'ZZZZZZ' });
assert.equal(badCode.status, 400, '无效课程码应被拒绝');
step('无效课程码被拒绝');

const join = await post(studentA, '/api/course', {
  op: 'join',
  joinCode: course.joinCode,
  studentNumber: '2026010101',
});
assert.equal(join.status, 200, `加入课程应成功：${JSON.stringify(join.body)}`);
step('学生 A 用课程码加入课程');

const joinAgain = await post(studentA, '/api/course', { op: 'join', joinCode: course.joinCode });
assert.equal(joinAgain.status, 200, '重复加入应幂等成功');
step('重复加入幂等');

const fileId = await uploadPixel(studentA);
step('学生 A 上传作业照片');

const submit = await post(studentA, '/api/submission', {
  action: 'submit',
  assignmentId: assignment.id,
  files: [fileId],
});
assert.equal(submit.status, 200, `提交应成功：${JSON.stringify(submit.body)}`);
const submissionA = submit.body.submission;
assert.equal(submissionA.status, 'pending', '未配置模型时保存为待批改');
assert.equal(submissionA.aiScore, null, '不得生成占位分数');
assert.equal(submissionA.aiPayload, null, '不得编造行号与批改结论');
step('无 AI 配置时照片保存成功，分数与批改载荷保持为空');
const retry = await post(studentA, '/api/submission', { action: 'regrade', submissionId: submissionA.id });
assert.equal(retry.status, 503, '未配置模型时重试应返回明确的服务不可用状态');
assert.equal((await get(studentA, `/api/submission?id=${submissionA.id}`)).body.submission.status, 'pending');
step('AI 批改失败不丢失提交');

const studentReview = await post(studentA, `/api/submission`, {
  action: 'review',
  submissionId: submissionA.id,
  score: 100,
  feedback: '给自己满分',
});
assert.equal(studentReview.status, 403, '学生调用审核接口应被 403 拒绝');
step('学生改分被拒绝（403）');

// ---------------------------------------------------------------- 学生 B 与数据隔离
const studentB = await signIn('student_b');
const joinB = await post(studentB, '/api/course', {
  op: 'join',
  joinCode: course.joinCode,
  studentNumber: '2026010102',
});
assert.equal(joinB.status, 200, `学生 B 加入课程应成功：${JSON.stringify(joinB.body)}`);

const bSeesCourse = await get(studentB, `/api/course?id=${course.id}`);
assert.equal(bSeesCourse.status, 200, `学生 B 应能看到课程：${JSON.stringify(bSeesCourse.body)}`);
assert.equal(bSeesCourse.body.role, 'student');
assert.ok(
  bSeesCourse.body.submissions.every((item) => item.studentId !== submissionA.studentId),
  '学生 B 不应看到学生 A 的提交',
);
step('学生之间提交互相不可见');

const bReadsASubmission = await get(studentB, `/api/submission?id=${submissionA.id}`);
assert.equal(bReadsASubmission.status, 403, '学生 B 读取学生 A 的提交应被拒绝');
step('跨学生读取提交被拒绝（403）');

assert.equal(bSeesCourse.body.submissions.length, 0, '学生 B 尚无提交');

// ---------------------------------------------------------------- 教师审核
const detail = await get(teacher, `/api/course?id=${course.id}`);
assert.equal(detail.status, 200, `教师应能读取课程：${JSON.stringify(detail.body)}`);
assert.equal(detail.body.role, 'teacher');
assert.equal(detail.body.submissions.length, 1, '教师应看到 1 份提交');
assert.equal(detail.body.students.length, 2, '教师应看到 2 名学生');
step('教师看到全班提交与学生名单');

const overScore = await post(teacher, `/api/submission`, {
  action: 'review',
  submissionId: submissionA.id,
  score: 101,
  feedback: '超过满分',
});
assert.equal(overScore.status, 400, '超过满分应被拒绝');
step('超过满分的审核被拒绝');

const emptyFeedback = await post(teacher, `/api/submission`, {
  action: 'review',
  submissionId: submissionA.id,
  score: 90,
  feedback: '   ',
});
assert.equal(emptyFeedback.status, 400, '空反馈应被拒绝');
step('空反馈被拒绝');

const review = await post(teacher, `/api/submission`, {
  action: 'review',
  submissionId: submissionA.id,
  score: 88,
  feedback: '第二题遗漏零解扣 8 分，第三题证明条件不完整扣 4 分。',
});
assert.equal(review.status, 200, `审核应成功：${JSON.stringify(review.body)}`);
assert.equal(review.body.submission.status, 'approved');
assert.equal(review.body.submission.finalScore, 88);
assert.equal(review.body.submission.category, '部分正确', '88/100 应判为部分正确');
assert.equal(review.body.submission.aiScore, null, '手动审核不得伪造 AI 分数');
step('教师审核定稿', '定稿 88 分 / 部分正确');

const teacherImage = await fetch(
  `${base}/api/files?id=${fileId}&owner=${submissionA.studentId}`,
  { headers: { cookie: teacher.cookie } },
);
assert.equal(teacherImage.status, 200, '任课教师应能读取学生原图');
step('任课教师可读取学生原图');

// ---------------------------------------------------------------- 分级边界
async function reviewWith(score) {
  const again = await post(teacher, `/api/submission`, {
    action: 'review',
    submissionId: submissionA.id,
    score,
    feedback: `测试分级 ${score}`,
  });
  assert.equal(again.status, 200, `审核 ${score} 分应成功`);
  return again.body.submission.category;
}
assert.equal(await reviewWith(100), '全对', '满分应为全对');
assert.equal(await reviewWith(0), '全错', '0 分应为全错');
assert.equal(await reviewWith(39), '部分正确', '39% 应为部分正确');
assert.equal(await reviewWith(40), '部分正确', '40% 应为部分正确');
step('分级边界正确（100→全对，0→全错，正分非满分→部分正确）');
await reviewWith(88);

// ---------------------------------------------------------------- 统计与导出
const stats = await get(teacher, `/api/stats?courseId=${course.id}`);
assert.equal(stats.status, 200, `统计应成功：${JSON.stringify(stats.body)}`);
assert.equal(stats.body.assignments.length, 1);
const rowA = stats.body.totals.find((row) => row.studentId === submissionA.studentId);
const rowB = stats.body.totals.find((row) => row.studentId !== submissionA.studentId);
assert.ok(rowA, '统计应包含学生 A');
assert.equal(rowA.approvedCount, 1, '学生 A 已审核 1 份');
assert.equal(rowA.average, 88, '学生 A 均分应为 88');
assert.equal(rowA.complete, true, '学生 A 总评应完整');
assert.equal(rowB.average, null, '未提交学生不应自动记零');
assert.equal(rowB.complete, false, '未提交学生总评应为暂定');
step('统计正确：未提交不记零，均分归一化');

const csv = await fetch(`${base}/api/stats`, {
  method: 'POST',
  headers: teacher,
  body: JSON.stringify({ courseId: course.id }),
});
assert.equal(csv.status, 200);
// 平台会重新编码响应体，BOM 可能被吃掉，因此按内容判断而不是按首字节。
assert.match(csv.headers.get('content-type') ?? '', /text\/csv/, '应返回 CSV 内容类型');
assert.match(
  csv.headers.get('content-disposition') ?? '',
  /attachment/,
  '应作为附件下载',
);
const csvText = await csv.text();
assert.ok(csvText.includes('已审核加权均分'), 'CSV 应包含统计表头');
assert.ok(csvText.includes('未提交'), 'CSV 应标注未提交');
step('CSV 导出可用');

// Different maxima and weights must normalize before averaging.
const second = await post(teacher, '/api/assignments', { op: 'create', courseId: course.id,
  title: '第二轮：参数方程', due: '2026-11-01T23:59', maxScore: 40, weight: 2,
  questions: '1. 求 x²=ax 的实数解，并讨论参数 a。', rubric: '本题40分。先因式分解，再讨论参数。' });
assert.equal(second.status, 200);
const submittedSecond = await post(studentA, '/api/submission', { action: 'submit', assignmentId: second.body.assignment.id, files: [fileId] });
assert.equal(submittedSecond.status, 200);
const beforeReview = await get(teacher, `/api/stats?courseId=${course.id}`);
const beforeRow = beforeReview.body.totals.find((row) => row.studentId === submissionA.studentId);
assert.equal(beforeRow.average, 88, '未审核的第二轮不计入均分');
assert.equal(beforeRow.complete, false, '未完成审核时总评暂定');
const secondReview = await post(teacher, '/api/submission', { action: 'review', submissionId: submittedSecond.body.submission.id, score: 20, feedback: '参数讨论不完整。' });
assert.equal(secondReview.status, 200);
const afterReview = await get(teacher, `/api/stats?courseId=${course.id}`);
const afterRow = afterReview.body.totals.find((row) => row.studentId === submissionA.studentId);
assert.ok(Math.abs(afterRow.average - (88 + (20 / 40 * 100) * 2) / 3) < .000001);
assert.equal(afterRow.approvedCount, 2); assert.equal(afterRow.complete, true);
step('两轮不同满分与权重先归一化再加权（88/100×1 + 20/40×2 → 62.67）');

// ---------------------------------------------------------------- 学生最终可见
const finalStudentView = await get(studentA, `/api/course?id=${course.id}`);
assert.equal(finalStudentView.status, 200, `学生 A 应能读取课程：${JSON.stringify(finalStudentView.body)}`);
const finalSubmission = finalStudentView.body.submissions.find((item) => item.id === submissionA.id);
assert.equal(finalSubmission.status, 'approved');
assert.equal(finalSubmission.finalScore, 88, '学生应看到教师定稿分');
assert.equal(finalSubmission.category, '部分正确');
step('学生可见教师定稿分与分级');

const finalMe = await get(studentA, '/api/me');
assert.ok(
  finalMe.body.courses.some((item) => item.id === course.id),
  '学生 A 的课程列表应包含本次加入的课程',
);
step('学生课程列表正确');

// ---------------------------------------------------------------- 匿名
const anonymous = await fetch(`${base}/api/me`);
assert.equal(anonymous.status, 401, '匿名访问应 401');
const anonymousImage = await fetch(`${base}/api/files?id=${fileId}`);
assert.equal(anonymousImage.status, 401, '匿名读图应 401');
step('匿名访问被拒绝');

console.log('PASS: 多用户教师/学生全链路');
console.log(results.join('\n'));
console.log(
  '\n覆盖：教师发布、课程码入课、拍照提交、未配置AI降级、' +
    '跨学生隔离、教师审核改分、分级边界、加权统计、CSV 导出、匿名与越权拦截。',
);
