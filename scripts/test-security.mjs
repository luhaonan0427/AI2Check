// 权限与删除边界回归测试。
//
// 覆盖那些「界面看不出来、但一旦出错就是数据泄露」的边界：
// 跨学生读图/读提交、伪造 owner、跨站写入、匿名操作、越权改分，
// 以及删除课程/作业（本地 Miniflare 下曾因 db.batch 报 SQLITE_CANTOPEN 而完全不可用）。
//
// 需要先启动本地开发服务： node scripts/run-framework.mjs dev
import assert from 'node:assert/strict';

const base = 'http://localhost:5173';
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=';

async function signIn(identity) {
  const response = await fetch(`${base}/signin-with-chatgpt?as=${identity}&return_to=/`, {
    redirect: 'manual',
  });
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie, `本地登录应返回 cookie（${identity}）`);
  return cookie;
}

async function call(cookie, path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      cookie,
      origin: base,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
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

const post = (cookie, path, payload) =>
  call(cookie, path, { method: 'POST', body: JSON.stringify(payload) });

async function uploadPixel(cookie) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([Buffer.from(PIXEL, 'base64')], { type: 'image/png' }),
    'page.png',
  );
  const response = await fetch(`${base}/api/files`, {
    method: 'POST',
    headers: { cookie, origin: base },
    body: form,
  });
  assert.equal(response.status, 200, '上传应成功');
  return (await response.json()).id;
}

const imageStatus = (cookie, fileId, owner) =>
  fetch(`${base}/api/files?id=${fileId}${owner ? `&owner=${owner}` : ''}`, {
    headers: cookie ? { cookie } : {},
  }).then((response) => response.status);

const results = [];
function expect(label, actual, expected) {
  assert.equal(actual, expected, `${label}：实际 ${actual}，期望 ${expected}`);
  results.push(`  ✓ ${label}`);
}

const teacher = await signIn('teacher');
const studentA = await signIn('student_a');
const studentB = await signIn('student_b');

const course = (
  await post(teacher, '/api/course', {
    op: 'create',
    name: '权限回归测试课程',
    code: 'SEC-CHECK',
  })
).body.course;
const assignmentA = (
  await post(teacher, '/api/assignments', {
    op: 'create',
    courseId: course.id,
    title: '待删除作业',
    due: '2026-10-01T23:59',
    maxScore: 100,
    weight: 1,
    questions: '1. 甲题\n2. 乙题',
    rubric: '甲 50 分，乙 50 分。',
  })
).body.assignment;
// 另建一份用于验证「删课程」路径，避免与上面互相干扰。
const assignmentB = (
  await post(teacher, '/api/assignments', {
    op: 'create',
    courseId: course.id,
    title: '保留作业',
    due: '2026-10-05T23:59',
    maxScore: 100,
    weight: 1,
    questions: '1. 丙题',
    rubric: '丙 100 分。',
  })
).body.assignment;

await post(studentA, '/api/course', {
  op: 'join',
  joinCode: course.joinCode,
  studentNumber: 'SEC0001',
});
const fileId = await uploadPixel(studentA);
const submission = (
  await post(studentA, '/api/submission', {
    action: 'submit',
    assignmentId: assignmentA.id,
    files: [fileId],
  })
).body.submission;

// ---------------------------------------------------------------- 读取边界
expect(
  '教师可读自己课程学生的提交',
  (await call(teacher, `/api/submission?id=${submission.id}`)).status,
  200,
);
expect('教师可读学生原图（带 owner）', await imageStatus(teacher, fileId, submission.studentId), 200);
expect('学生 B 不能读学生 A 的原图', await imageStatus(studentB, fileId, submission.studentId), 403);
expect('学生 A 不能谎报 owner 读他人存储', await imageStatus(studentA, fileId, 'local_teacher'), 403);
expect(
  '学生 B 不能读学生 A 的提交',
  (await call(studentB, `/api/submission?id=${submission.id}`)).status,
  403,
);
expect('学生 B 不能读学生 A 的订正记录', (await call(studentB, `/api/tutor?submissionId=${submission.id}`)).status, 403);
expect('学生 B 不能重批他人作业', (await post(studentB, '/api/submission', { action: 'regrade', submissionId: submission.id })).status, 403);
expect('没有 AI 批改时不能编造订正反馈', (await post(studentA, '/api/tutor', { submissionId: submission.id, answer: '我的订正是 x=0 或 x=1' })).status, 400);
expect('匿名不能读提交', (await fetch(`${base}/api/submission?id=${submission.id}`)).status, 401);
expect('匿名不能读原图', await imageStatus('', fileId), 401);
expect('学生 A 可以读自己的原图', await imageStatus(studentA, fileId), 200);
// 图片 id 格式非法时不泄露信息
expect('非法图片 id 返回 404', await imageStatus(studentA, 'not-a-uuid'), 404);

// ---------------------------------------------------------------- 写入边界
expect('匿名不能删除课程', (await post('', '/api/course', { op: 'delete', courseId: course.id })).status, 401);
expect(
  '学生不能删除课程',
  (await post(studentA, '/api/course', { op: 'delete', courseId: course.id })).status,
  403,
);
expect(
  '学生不能创建课程',
  (await post(studentA, '/api/course', { op: 'create', name: 'x', code: 'y' })).status,
  403,
);
expect(
  '教师不能给不存在的课程发作业',
  (
    await post(teacher, '/api/assignments', {
      op: 'create',
      courseId: '00000000-0000-4000-8000-000000000000',
      title: 'x',
      due: '2026-10-01T23:59',
      maxScore: 100,
      weight: 1,
      questions: 'q',
      rubric: 'r',
    })
  ).status,
  404,
);
expect(
  '跨站 Origin 写入被拒绝',
  (
    await call(teacher, '/api/course', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({ op: 'create', name: 'x', code: 'y' }),
    })
  ).status,
  403,
);
expect(
  '学生不能给自己打分',
  (
    await post(studentA, '/api/submission', {
      action: 'review',
      submissionId: submission.id,
      score: 100,
      feedback: '给自己满分',
    })
  ).status,
  403,
);
expect(
  '审核不存在的提交返回 404',
  (
    await post(teacher, '/api/submission', {
      action: 'review',
      submissionId: '00000000-0000-4000-8000-000000000000',
      score: 95,
      feedback: 'ok',
    })
  ).status,
  404,
);
expect(
  '教师可审核自己课程的学生',
  (
    await post(teacher, '/api/submission', {
      action: 'review',
      submissionId: submission.id,
      score: 95,
      feedback: '已核对。',
    })
  ).status,
  200,
);
// 未选课账号无权访问别人的课程。
// 403（明确拒绝）与 404（不暴露存在性）都算正确，这里只要求「不是 200」。
const otherTeacherRead = await call(await signIn('local_seedy'), `/api/course?id=${course.id}`);
assert.ok(
  otherTeacherRead.status === 403 || otherTeacherRead.status === 404,
  `其他教师不应读到别人的课程，实际 ${otherTeacherRead.status}`,
);
results.push(`  ✓ 未选课账号不能读别人的课程（${otherTeacherRead.status}）`);

// ---------------------------------------------------------------- 删除路径
expect(
  '删除有提交的作业',
  (await post(teacher, '/api/assignments', { op: 'delete', assignmentId: assignmentA.id })).status,
  200,
);
expect(
  '删除作业后课程仍可读',
  (await call(studentA, `/api/course?id=${course.id}`)).status,
  200,
);
expect(
  '删除作业后其提交不可读',
  (await call(teacher, `/api/submission?id=${submission.id}`)).status,
  404,
);
expect(
  '删除有提交的课程',
  (await post(teacher, '/api/course', { op: 'delete', courseId: course.id })).status,
  200,
);
expect(
  '删除课程后学生读不到',
  (await call(studentA, `/api/course?id=${course.id}`)).status,
  404,
);
expect(
  '删除课程后其作业不可读',
  (await call(teacher, `/api/assignments?courseId=${course.id}`)).status,
  404,
);
expect('重复删除课程返回 404', (await post(teacher, '/api/course', { op: 'delete', courseId: course.id })).status, 404);

console.log('PASS: 权限与删除边界');
console.log(results.join('\n'));
console.log(`\n共 ${results.length} 项边界检查全部通过。`);
// 保留 assignmentB 只是为了确认删除课程时级联清理多份作业，这里显式声明意图。
assert.ok(assignmentB.id, '保留作业应创建成功');
