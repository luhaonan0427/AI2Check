// 用 headless Chrome + CDP 取回「执行过 JavaScript 之后的真实 DOM」。
//
// 为什么需要它：学生端/教师端页面是客户端渲染（数据在 useEffect 里 fetch），
// 直接请求 HTML 只能拿到空壳，无法验证数据是否真的渲染出来。
// 本脚本让真实浏览器加载页面、等待数据渲染完成，再取回 DOM。
//
// 用法：
//   node scripts/browser-check.mjs <身份> <路径> [等待毫秒] [--json 输出路径]
//   node scripts/browser-check.mjs <身份> <路径> [等待毫秒] --must "文本1" "文本2" --mustnot "文本3"
//   身份：teacher | student_a | student_b | student_c | local_seedy | anon
//
// --must / --mustnot 会断言「执行 JavaScript 后的可见文本」是否包含/不含指定串，
// 不满足则退出码 1。这是验证客户端渲染页面的唯一可靠方式。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const base = process.env.BASE ?? 'http://localhost:5173';
const argv = process.argv.slice(2);
const identity = argv[0] ?? 'anon';
const targetPath = argv[1] ?? '/';
const waitMs = Number(argv[2] ?? 4000);

function collect(flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return [];
  const values = [];
  for (let cursor = index + 1; cursor < argv.length; cursor += 1) {
    const value = argv[cursor];
    if (value.startsWith('--')) break;
    values.push(value);
  }
  return values;
}

const must = collect('--must');
const mustNot = collect('--mustnot');
const jsonIndex = argv.indexOf('--json');
const jsonOut = jsonIndex === -1 ? null : argv[jsonIndex + 1];

// 必须放在项目树之外：Chrome 会持续写入 profile，
// 若落在项目里会被 Vite 的文件监听扫到并抛 EBUSY 击穿开发服务。
const tmpDir = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'mathflow-browser');
// 固定使用 Chrome 的默认 profile 目录名，且每次运行前整个删除：
// 否则上一次身份留下的 cookie 会残留在 profile 里，导致本次身份被覆盖
// （表现为「以 student 身份访问却拿到教师数据」，非常容易被误判成后端越权）。
const profileDir = path.join(tmpDir, 'profile');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chrome) {
  console.error('找不到可用的 Chrome/Edge');
  process.exit(1);
}

// 1) 取登录 cookie。本地插件接受 __sites_local_auth 直接指定身份。
const cookieJar = new Map();
if (identity !== 'anon') {
  const response = await fetch(`${base}/signin-with-chatgpt?as=${identity}&return_to=/`, {
    redirect: 'manual',
  });
  const raw = response.headers.getSetCookie().find((value) =>
    value.startsWith('__sites_local_auth='),
  );
  if (raw) cookieJar.set('__sites_local_auth', raw.split(';')[0].split('=')[1]);
}

// 2) 启动 Chrome，开远程调试端口。
const port = 9333 + (process.pid % 500);
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // 还没起来
    }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;

    const send = (method, params = {}, sessionId) =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result);
      }
    });
    socket.addEventListener('error', () => reject(new Error('CDP 连接失败')));
    socket.addEventListener('open', () => resolve({ send, close: () => socket.close() }));
  });
}

let exitCode = 0;
try {
  await findTarget();
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(
    (response) => response.json(),
  );
  const client = await cdp(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  // 3) 先注入 cookie，再访问目标页面。
  const cookies = [...cookieJar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
  }));
  if (cookies.length) {
    await client.send('Network.setCookies', { cookies });
  }

  await client.send('Page.navigate', { url: base + targetPath });
  await sleep(waitMs);

  const { result } = await client.send('Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  });
  const html = result.value ?? '';
  writeFileSync(path.join(tmpDir, 'last.html'), html, 'utf8');

  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  writeFileSync(path.join(tmpDir, 'last.txt'), text, 'utf8');

  // 自证身份：确认浏览器实际以哪个身份在请求，避免身份串号导致的误判。
  const identityProbe = await client.send('Runtime.evaluate', {
    expression:
      "fetch('/api/me',{cache:'no-store'}).then(r=>r.json()).then(d=>JSON.stringify(d.user??null)).catch(()=>'error')",
    awaitPromise: true,
    returnByValue: true,
  });

  console.log(`身份=${identity} 路径=${targetPath} DOM字节=${html.length} 文本长度=${text.length}`);
  console.log(`浏览器实际身份：${identityProbe.result?.value ?? '未知'}`);
  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify({ identity, path: targetPath, domBytes: html.length, text }, null, 2),
      'utf8',
    );
  }

  const failures = [];
  for (const needle of must) {
    if (!text.includes(needle)) failures.push(`缺少「${needle}」`);
  }
  for (const needle of mustNot) {
    if (text.includes(needle)) failures.push(`不应出现「${needle}」`);
  }

  if (must.length || mustNot.length) {
    if (failures.length) {
      console.log('断言失败：');
      for (const failure of failures) console.log(`  ✗ ${failure}`);
      console.log('--- 实际可见文本 ---');
      console.log(text.slice(0, 1500));
      exitCode = 1;
    } else {
      console.log(
        `断言通过：must ${must.length} 项、mustnot ${mustNot.length} 项`,
      );
      for (const needle of must) console.log(`  ✓ 包含「${needle}」`);
      for (const needle of mustNot) console.log(`  ✓ 不含「${needle}」`);
    }
  } else {
    console.log('--- 可见文本（前 1200 字）---');
    console.log(text.slice(0, 1200));
  }
  client.close();
} catch (error) {
  console.error('检查失败：', error.message);
  exitCode = 1;
} finally {
  child.kill();
  await sleep(300);
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
}

process.exit(exitCode);
