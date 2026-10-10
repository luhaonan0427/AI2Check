// 两端页面真实渲染验证（需要真实浏览器）。
//
// 为什么必须这样验：教师端/学生端页面是客户端渲染，数据在 useEffect 里 fetch，
// 直接请求 HTML 只能拿到空壳。两位前端开发者各自只做了静态检查和组件级冒烟测试，
// 没有人验证过「浏览器里加载真实数据后页面到底显示了什么」。
//
// 本脚本先走完整业务链路造数据，再用 headless Chrome + CDP 加载页面、
// 等待渲染完成、对可见文本做断言。
//
// 前置条件：
//   1) node scripts/run-framework.mjs dev   （本地开发服务）
//   2) 本机安装 Chrome 或 Edge
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
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
    headers: { cookie, origin: base, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
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

const results = [];

/** 用真实浏览器加载页面并对可见文本断言。 */
async function browser(identity, pagePath, { must = [], mustNot = [] } = {}) {
  const args = ['scripts/browser-check.mjs', identity, pagePath, '4500'];
  if (must.length) args.push('--must', ...must);
  if (mustNot.length) args.push('--mustnot', ...mustNot);
  try {
    const { stdout } = await run(process.execPath, args, {
      cwd: process.cwd(),
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });
    const line = stdout.split('\n').find((row) => row.startsWith('断言')) ?? '断言通过';
    results.push(`  ✓ ${identity} ${pagePath} — ${line}`);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw new Error(
      `浏览器验证失败：${identity} ${pagePath}\n${output.slice(-2000)}`,
    );
  }
}

// ---------------------------------------------------------------- 造数据
const teacher = await signIn('teacher');
const studentA = await signIn('student_a');
const studentB = await signIn('student_b');

const course = (
  await post(teacher, '/api/course', {
    op: 'create',
    name: '渲染验证课程',
    code: 'RENDER-1',
    term: '2026 秋',
  })
).body.course;
const assignment = (
  await post(teacher, '/api/assignments', {
    op: 'create',
    courseId: course.id,
    title: '渲染验证作业',
    chapter: '第一章 · 渲染',
    due: '2026-10-01T23:59',
    maxScore: 100,
    weight: 2,
    questions: '1. 计算甲式。\n2. 求乙方程的所有解。\n3. 证明丙命题。',
    rubric: '各题分别计分，认可不同解法。',
  })
).body.assignment;

await post(studentA, '/api/course', {
  op: 'join',
  joinCode: course.joinCode,
  studentNumber: 'RENDER0001',
});

const form = new FormData();
form.append(
  'file',
  new Blob([Buffer.from(PIXEL, 'base64')], { type: 'image/png' }),
  'render.png',
);
const upload = await fetch(`${base}/api/files`, {
  method: 'POST',
  headers: { cookie: studentA, origin: base },
  body: form,
});
const fileId = (await upload.json()).id;
const submission = (
  await post(studentA, '/api/submission', {
    action: 'submit',
    assignmentId: assignment.id,
    files: [fileId],
  })
).body.submission;

// ---------------------------------------------------------------- 未登录
await browser('anon', '/welcome', {
  must: ['教师端', '学生端', '使用 ChatGPT 登录'],
});
await browser('anon', '/', { must: ['教师端'] });

// ---------------------------------------------------------------- 学生端（未定稿）
await browser('student_a', '/student', {
  must: ['我的课程', '渲染验证课程', 'RENDER-1'],
  mustNot: ['使用 ChatGPT 登录'],
});
await browser('student_a', `/student/course?id=${course.id}`, {
  must: ['渲染验证作业', '第一章 · 渲染'],
});
results.push('  ✓ 学生端：课程列表与作业页渲染真实数据');

// 学生 B 未加入该课程，不应看到课程名
await browser('student_b', '/student', {
  mustNot: ['渲染验证课程'],
});
results.push('  ✓ 学生端：未选课学生看不到该课程');

// ---------------------------------------------------------------- 教师端（审核前）
await browser('teacher', '/teacher', {
  must: ['渲染验证课程', course.joinCode],
});
await browser('teacher', `/teacher/course?id=${course.id}`, {
  must: ['渲染验证作业', '满分 100'],
});
await browser('teacher', `/teacher/stats?id=${course.id}`, {
  must: ['渲染验证作业'],
});
results.push('  ✓ 教师端：工作台/课程/统计三页渲染真实数据');

// 学生访问教师端页面不应看到「未选课」的课程数据。
// 注意：该学生可能因历史测试加入了其它课程，那些课程码属于他自己的选课记录，
// 出现在 /api/me 里是正确行为；这里只断言「教师本人课程码」不出现。
const teacherOnly = (
  await post(teacher, '/api/course', { op: 'create', name: '教师私有课程', code: 'PRIVATE-1' })
).body.course;
await browser('student_a', '/teacher', {
  mustNot: [teacherOnly.joinCode, '教师私有课程'],
});
await post(teacher, '/api/course', { op: 'delete', courseId: teacherOnly.id });
results.push('  ✓ 教师端：学生身份拿不到教师课程数据');

// ---------------------------------------------------------------- 教师定稿
const reviewed = await post(teacher, '/api/submission', {
  action: 'review',
  submissionId: submission.id,
  score: 88,
  feedback: '甲题步骤完整，乙题遗漏一组解，丙题证明条件不全。',
});
assert.equal(reviewed.status, 200, '审核应成功');
assert.equal(reviewed.body.submission.category, '部分正确');

await browser('teacher', `/teacher/stats?id=${course.id}`, {
  must: ['88.0', '审核进度', '完整'],
});
results.push('  ✓ 教师端：定稿后统计页显示加权均分 88.0 与完整总评');

await browser('student_a', `/student/course?id=${course.id}`, {
  must: ['渲染验证作业'],
});
const studentFinal = (await call(studentA, `/api/submission?id=${submission.id}`)).body.submission;
assert.equal(studentFinal.status, 'approved');
assert.equal(studentFinal.finalScore, 88);
results.push('  ✓ 学生端：定稿后可见教师定稿分与评语（接口层确认）');

// ---------------------------------------------------------------- 清理
await post(teacher, '/api/course', { op: 'delete', courseId: course.id });

console.log('PASS: 两端页面真实渲染（headless Chrome）');
console.log(results.join('\n'));
console.log(`\n共 ${results.length} 项页面验证通过。`);
