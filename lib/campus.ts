import {z} from 'zod';
/** Namespacing preserves existing data and historical API compatibility. */
export function campusDatabase(db:D1Database):D1Database {
 const tables=/\b(accounts|sessions|rate_limits|courses|classes|enrollments|assignments|submissions|submission_history|uploads)\b/g;
 return new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>target.prepare(sql.replace(tables,'campus_$1'));const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
}
export class AppError extends Error {constructor(message:string,public status=400){super(message)}}
export type User={id:string;username:string;name:string;number:string;role:string;teacher_request:string};
export const fields='id,username,name,number,role,teacher_request';
export const now=()=>Date.now();
export const id=()=>crypto.randomUUID();
export const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('')}
export async function passwordHash(password:string,salt=token()){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
 return `pbkdf2$100000$${salt}$${Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('')}`;
}
export async function passwordMatches(password:string,hash:string){const expected=await passwordHash(password,hash.split('$')[2]||'invalid');let diff=expected.length^hash.length;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(hash.charCodeAt(i)||0);return diff===0}
export const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>campusDatabase(db).prepare(sql).bind(...args).first<T>();
export const all=async<T>(db:D1Database,sql:string,...args:unknown[])=>(await campusDatabase(db).prepare(sql).bind(...args).all<T>()).results;
export const run=async(db:D1Database,sql:string,...args:unknown[])=>campusDatabase(db).prepare(sql).bind(...args).run();
export async function rate(db:D1Database,key:string,max:number,window=900000){
 const t=now();const r=await one<{count:number}>(db,'INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count',key,t+window,t,t);
 if((r?.count||0)>max)throw new AppError('操作过于频繁，请稍后再试',429);
}
export function sameOrigin(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)throw new AppError('请求来源无效',403)}
export async function readJSON(req:Request){
 if(!req.headers.get('content-type')?.includes('application/json'))throw new AppError('需要 JSON 请求');
 const reader=req.body?.getReader();if(!reader)throw new AppError('内容为空');const decoder=new TextDecoder();let text='',bytes=0;
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>200000){await reader.cancel();throw new AppError('内容过长',413)}text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode();
 if(text.length>60000)throw new AppError('内容过长',413);try{return JSON.parse(text)}catch{throw new AppError('内容格式有误')}
}
export function json(v:unknown,status=200,headers:Record<string,string>={}){return Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}})}
export function failure(e:unknown){if(e instanceof AppError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:e.errors[0]?.message||'请检查输入'},400);console.error('Campus request failed',e);return json({error:'服务暂时不可用，请稍后重试'},503)}
export async function currentUser(db:D1Database,req:Request){const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('mf_session='))?.slice(11);if(!value||!/^[a-f0-9]{64}$/.test(value))return null;return one<User>(db,`SELECT ${fields.split(',').map(s=>'a.'+s).join(',')} FROM accounts a JOIN sessions s ON a.id=s.user_id WHERE s.token=? AND s.expires>?`,await digest(value),now())}
export async function mustUser(db:D1Database,req:Request){const u=await currentUser(db,req);if(!u)throw new AppError('请先登录',401);return u}
export function cookie(req:Request,t:string,maxAge=604800){return `mf_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`}
export async function newSession(db:D1Database,userId:string,req:Request){const t=token();await run(db,'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(t),userId,now()+604800000);await run(db,'DELETE FROM sessions WHERE expires<?',now());return cookie(req,t)}
export async function managedClass(db:D1Database,user:User,classId:string){const c=await one<{id:string;course_id:string;owner:string;name:string}>(db,'SELECT cl.*,c.owner FROM classes cl JOIN courses c ON cl.course_id=c.id WHERE cl.id=?',classId);if(!c||(c.owner!==user.id&&user.role!=='admin'))throw new AppError('无权管理该班级',403);return c}
export async function enrolled(db:D1Database,user:User,classId:string){if(!await one(db,"SELECT id FROM enrollments WHERE class_id=? AND user_id=? AND status='active'",classId,user.id))throw new AppError('需先加入班级并通过审核',403)}
export type Assignment={id:string;class_id:string;title:string;body:string;rubric:string;deadline:number;max_score:number;weight:number;allow_late:number;created:number};
export async function assignment(db:D1Database,assignmentId:string){const a=await one<Assignment>(db,'SELECT * FROM assignments WHERE id=?',assignmentId);if(!a)throw new AppError('作业不存在',404);return a}
export function canSubmit(a:Assignment,status?:string){if(now()>a.deadline&&!a.allow_late&&status!=='returned')throw new AppError('已超过截止时间，请联系老师允许补交')}
export const str=(max=200)=>z.string().trim().min(1,'请填写必填内容').max(max,'内容过长');
export const uuid=z.string().uuid('记录编号无效');
