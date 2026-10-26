// Synthetic model responses: no network or billable API calls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = path.resolve('.sites-runtime/checks');
await mkdir(dir, { recursive: true });
const outfile = path.join(dir, 'grader.mjs');
await build({ entryPoints: ['app/grader.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'test-boundaries', setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    b.onResolve({ filter: /^@\/app\/api\/shared$/ }, () => ({ path: 'errors', namespace: 'test' }));
    b.onLoad({ filter: /^env$/, namespace: 'test' }, () => ({ contents: 'export const env = globalThis.testEnv;' }));
    b.onLoad({ filter: /^errors$/, namespace: 'test' }, () => ({ contents: 'export class ApiError extends Error { constructor(m,s){super(m);this.status=s;} }' }));
  } }],
});
globalThis.testEnv = { OPENAI_API_KEY: 'synthetic-test-key', OPENAI_MODEL: 'synthetic-vision-model' };
const { gradeSubmission } = await import(pathToFileURL(outfile));
const sourceFetch = globalThis.fetch;
let calls = 0, lastRequest;
const line = { page: 1, line: 3, box: [.1,.2,.5,.04], text: 'x-1=0', isFirstError: true, issue: '除以x遗漏零解', deduction: 20 };
const question = { number: 1, score: 80, maxScore: 100, verdict: 'partial', summary: '遗漏零解。', lines: [line] };
const grade = { score: 80, maxScore: 100, confidence: .85, needsReview: false, summary: '遗漏零解。', questions: [question],
  practice: { prompt: '讨论x=0', hints: ['使用乘积为零'], expected: ['x=0或1'], explain: '两个因式分别为零' },
  extensions: [{ prompt: '求 x²=ax 的所有解，并讨论 a=0。', level: '提高', goal: '参数讨论' }],
};
const input = { assignment: { id: 'a', title: '方程', maxScore: 100, questions: '1. x²=x', rubric: '本题100分' }, studentId: 's', files: [{ id: 'image1', bytes: new Uint8Array([1,2,3]).buffer, contentType: 'image/png' }] };
let output = grade;
globalThis.fetch = async (_url, options) => { calls++; lastRequest = JSON.parse(options.body); return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }); };
try {
  const result = await gradeSubmission(input);
  assert.equal(result.score, 80); assert.equal(result.placeholder, false); assert.equal(result.category, '部分正确');
  assert.equal(lastRequest.store, false); assert.equal(lastRequest.text.format.strict, true);
  assert.equal(lastRequest.input[0].content[1].image_url, 'data:image/png;base64,AQID');
  assert.equal(result.questions[0].lines[0].page, 1);
  console.log('✓ image input, strict output, page/line/box, scoring and practice');
  const invalid = [
    { ...grade, score: 101 }, { ...grade, score: 79 }, { ...grade, maxScore: 99 }, { ...grade, confidence: 2 },
    { ...grade, questions: [{ ...question, lines: [{ ...line, page: 2 }] }] },
    { ...grade, questions: [{ ...question, lines: [{ ...line, deduction: 10 }] }] },
    { ...grade, questions: [{ ...question, lines: [{ ...line, box: [.9,.2,.5,.04] }] }] },
  ];
  for (const item of invalid) { output = item; await assert.rejects(() => gradeSubmission(input), (e) => e.status === 503); }
  console.log('✓ invalid totals, confidence, page numbers, deductions and boxes rejected');
  output = { ...grade, score: 0, questions: [{ ...question, score: 0, verdict: 'wrong', lines: [{ ...line, deduction: 100 }] }] };
  assert.equal((await gradeSubmission(input)).category, '全错');
  output = { ...grade, score: 100, questions: [{ ...question, score: 100, verdict: 'correct', lines: [] }] };
  assert.equal((await gradeSubmission(input)).category, '全对');
  globalThis.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(() => gradeSubmission(input), (e) => e.status === 503);
  globalThis.fetch = async () => Response.json({ status: 'incomplete', output: [] });
  await assert.rejects(() => gradeSubmission(input), (e) => e.status === 503);
  globalThis.fetch = async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] });
  await assert.rejects(() => gradeSubmission(input), (e) => e.status === 503);
  globalThis.testEnv.OPENAI_API_KEY = '';
  const before = calls;
  await assert.rejects(() => gradeSubmission(input), (e) => e.status === 503);
  assert.equal(calls, before);
  console.log('✓ categories, rate limits, incomplete/refused output and missing configuration');
  globalThis.testEnv.OPENAI_API_KEY='synthetic-openai-key';
  globalThis.testEnv.DEEPSEEK_API_KEY='synthetic-deepseek-key';
  globalThis.testEnv.AI_PROVIDER='deepseek';
  globalThis.testEnv.DEEPSEEK_MODEL='deepseek-flash';
  let lastURL,authorization;
  globalThis.fetch=async(url,options)=>{calls++;lastURL=url;authorization=options.headers.Authorization;lastRequest=JSON.parse(options.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]})};
  const ds=await gradeSubmission(input);
  assert.equal(lastURL,'https://api.deepseek.com/responses');
  assert.equal(authorization,'Bearer synthetic-deepseek-key');
  assert.equal(ds.source,'deepseek:deepseek-flash');
  assert.equal(lastRequest.store,undefined);assert.equal(lastRequest.reasoning.effort,'high');assert.equal(lastRequest.text.format.strict,true);
  globalThis.testEnv.DEEPSEEK_MODEL='deepseek-v4-pro';
  const imageCalls=calls;
  await assert.rejects(()=>gradeSubmission(input),/不支持作业照片/);assert.equal(calls,imageCalls);
  await gradeSubmission({...input,files:[],answer:'x=1'});
  globalThis.testEnv.DEEPSEEK_API_KEY='';
  const missingCalls=calls;await assert.rejects(()=>gradeSubmission({...input,files:[],answer:'x=1'}),/尚未配置/);assert.equal(calls,missingCalls);
  globalThis.testEnv.AI_PROVIDER='invalid';
  await assert.rejects(()=>gradeSubmission(input),/配置无效/);assert.equal(calls,missingCalls);
  globalThis.testEnv.AI_PROVIDER='deepseek';globalThis.testEnv.DEEPSEEK_API_KEY='synthetic-deepseek-key';globalThis.testEnv.DEEPSEEK_MODEL='deepseek-flash';
  globalThis.fetch=async()=>new Response('',{status:402});
  await assert.rejects(()=>gradeSubmission(input),/余额不足/);
  console.log('✓ DeepSeek endpoint/key isolation, structured image output, text-only model guard, no silent provider fallback and insufficient-balance errors');
  console.log('PASS: AI contract (synthetic responses; live vision accuracy not evaluated)');
} finally { globalThis.fetch = sourceFetch; delete globalThis.testEnv; }
