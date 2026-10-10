// 清空本地开发数据库里的业务数据（保留表结构）。
//
// 用途：测试会不断累积课程、提交、选课记录，久了会让「学生课程列表」之类
// 的断言变得难以判断，也让界面很乱。本脚本只作用于本地 Miniflare D1。
//
// 用法：node scripts/reset-local.mjs            删除业务数据，保留用户
//       node scripts/reset-local.mjs --users    连用户一起删除（角色会重新分配）
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const withUsers = process.argv.includes('--users');
const root = process.cwd();
const d1Dir = path.join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

if (!existsSync(d1Dir)) {
  console.error(`找不到本地 D1 目录：${d1Dir}`);
  process.exit(1);
}

const file = readdirSync(d1Dir)
  .filter((name) => name.endsWith('.sqlite') && !name.startsWith('metadata'))
  .map((name) => path.join(d1Dir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

if (!file) {
  console.error('本地 D1 目录里没有 .sqlite 文件');
  process.exit(1);
}

const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys = ON');

// 顺序：先删子表。D1 不支持事务，逐条执行即可。
const tables = ['tutor_messages', 'submissions', 'assignments', 'enrollments', 'courses'];
if (withUsers) tables.push('users');

const before = {};
for (const table of [...tables, 'workspaces']) {
  before[table] = count(db, table);
}

for (const table of tables) {
  try {
    db.exec(`DELETE FROM ${table}`);
  } catch (error) {
    console.error(`清空 ${table} 失败：${error.message}`);
    db.close();
    process.exit(1);
  }
}

console.log(`已清空本地数据（${path.basename(file)}）：`);
for (const table of tables) {
  console.log(`  ${table}: ${before[table]} → ${count(db, table)}`);
}
if (!withUsers) {
  console.log('用户保留，角色不变（教师仍是教师）。需要连用户一起删就加 --users。');
}
db.close();

function count(database, table) {
  try {
    return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  } catch {
    return '（表不存在）';
  }
}
