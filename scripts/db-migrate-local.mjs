// 把 drizzle 迁移直接应用到本地 Miniflare D1 的 SQLite 文件。
//
// 为什么不直接用 wrangler：
// 本机的沙箱/环境无法启动 workerd（std::terminate），`wrangler d1 execute`
// 会失败。本地 D1 本身就是一个标准 SQLite 文件，因此这里直接用它写入。
// 只用于本地开发；线上由托管平台在发布时自动应用迁移。
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const d1Dir = path.join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const migrationsDir = path.join(root, 'drizzle');

if (!existsSync(d1Dir)) {
  console.error(`找不到本地 D1 目录：${d1Dir}`);
  process.exit(1);
}

const candidates = readdirSync(d1Dir).filter(
  (name) => name.endsWith('.sqlite') && !name.startsWith('metadata'),
);
// 取最近修改的那个，即当前 Miniflare 正在使用的库。
const dbs = candidates
  .map((name) => ({ name, file: path.join(d1Dir, name) }))
  .sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);

if (dbs.length === 0) {
  console.error('本地 D1 目录里没有 .sqlite 文件');
  process.exit(1);
}

const target = dbs[0].file;
console.log(`本地 D1 文件：${path.relative(root, target)}`);

const db = new DatabaseSync(target);
db.exec('PRAGMA foreign_keys = ON');

db.exec(
  'CREATE TABLE IF NOT EXISTS __applied_migrations (tag text PRIMARY KEY NOT NULL, applied_at text NOT NULL)',
);

const applied = new Set(
  db
    .prepare('SELECT tag FROM __applied_migrations')
    .all()
    .map((row) => String(row.tag)),
);

function tableExists(name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),
  );
}

// 回填：这些表在引入迁移跟踪之前就已由平台创建，
// 直接重放会因 already exists 失败，因此先登记为已应用。
const preexisting = [
  { tag: '0000_lyrical_killer_shrike', table: 'workspaces' },
];
for (const entry of preexisting) {
  if (!applied.has(entry.tag) && tableExists(entry.table)) {
    db.prepare('INSERT INTO __applied_migrations (tag, applied_at) VALUES (?, ?)').run(
      entry.tag,
      new Date().toISOString(),
    );
    applied.add(entry.tag);
    console.log(`  回填 ${entry.tag}（${entry.table} 已存在）`);
  }
}

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

let count = 0;
for (const file of files) {
  const tag = file.replace(/\.sql$/, '');
  if (applied.has(tag)) {
    console.log(`  跳过 ${tag}（已应用）`);
    continue;
  }
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  // drizzle 用 --> statement-breakpoint 分隔语句；SQLite 可以一次执行多句。
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  db.exec('BEGIN');
  try {
    for (const statement of statements) db.exec(statement);
    db.prepare('INSERT INTO __applied_migrations (tag, applied_at) VALUES (?, ?)').run(
      tag,
      new Date().toISOString(),
    );
    db.exec('COMMIT');
    count += 1;
    console.log(`  已应用 ${tag}（${statements.length} 条语句）`);
  } catch (error) {
    db.exec('ROLLBACK');
    console.error(`  应用 ${tag} 失败：${error.message}`);
    db.close();
    process.exit(1);
  }
}

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => String(row.name));
console.log(`完成：应用 ${count} 个迁移。当前表：${tables.join(', ')}`);
db.close();
