// Explicit live check: only a synthetic arithmetic exercise, no student data.
// Reads credentials from the ignored local server config; never prints them.
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const values=Object.fromEntries((await readFile('.dev.vars','utf8')).split(/\r?\n/).filter(s=>/^[A-Z_]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).trim().replace(/^(["'])(.*)\1$/,'$2')]}));
if(values.AI_PROVIDER!=='deepseek'||!values.DEEPSEEK_API_KEY)throw Error('Configure DeepSeek in .dev.vars first.');
globalThis.testEnv=values;
const outfile=path.resolve('.sites-runtime/checks/deepseek-live.mjs');await mkdir(path.dirname(outfile),{recursive:true});
await build({stdin:{contents:"export {requestStructured} from './app/ai/client';export {gradeSubmission} from './app/grader';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'local-env',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));
 b.onResolve({filter:/^@\/app\/api\/shared$/},()=>({path:'errors',namespace:'test'}));
 b.onLoad({filter:/^env$/,namespace:'test'},()=>({contents:'export const env=globalThis.testEnv;'}));
 b.onLoad({filter:/^errors$/,namespace:'test'},()=>({contents:'export class ApiError extends Error {constructor(m,s){super(m);this.status=s;}}'}));
}}]});
try{
 const {requestStructured,gradeSubmission}=await import(pathToFileURL(outfile));
 const solution=await requestStructured({name:'arithmetic_check',schema:{type:'object',properties:{answer:{type:'integer'}},required:['answer'],additionalProperties:false},instructions:'Calculate the expression and return the JSON answer.',content:[{type:'input_text',text:'2+2'}]});
 assert.equal(solution.answer,4);console.log('PASS LIVE: DeepSeek authenticated text input and structured JSON output.');
 const bytes=await readFile('tests/fixtures/deepseek-synthetic-answer.png');
 const grade=await gradeSubmission({assignment:{id:'synthetic',title:'Arithmetic integration check',maxScore:10,questions:'Compute 2+2.',rubric:'Correct result is 4. An incorrect result receives 0/10.'},studentId:'synthetic',files:[{id:'synthetic-image',bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType:'image/png'}]});
 assert.equal(grade.score,0);assert.equal(grade.source,'deepseek:'+values.DEEPSEEK_MODEL);assert(grade.questions.some(q=>q.lines.some(l=>l.page===1&&l.line>=1)));
 console.log('PASS LIVE: synthetic image read, incorrect arithmetic graded 0/10, page/line feedback and score schema validated.');
}catch(e){console.error('LIVE CHECK FAILED:',e.message);process.exitCode=1}finally{delete globalThis.testEnv}
