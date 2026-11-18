import { spawnSync } from 'node:child_process';
const base = 'http://localhost:5173';
try {
  const signIn = await fetch(`${base}/signin-with-chatgpt?as=teacher&return_to=/`, { redirect: 'manual' });
  const cookie = signIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('未检测到本地开发登录，请先启动 node scripts/run-framework.mjs dev');
  // The first DB request materializes the local SQLite file; missing tables are expected before migration.
  await fetch(`${base}/api/me`, { headers: { cookie } });
  const result = spawnSync(process.execPath, ['scripts/db-migrate-local.mjs'], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
  const me = await fetch(`${base}/api/me`, { headers: { cookie } });
  if (!me.ok) throw new Error('初始化后身份接口仍不可用，请检查开发服务日志');
  console.log(`本地数据库已就绪。打开 ${base}/welcome 体验教师和学生端。`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
