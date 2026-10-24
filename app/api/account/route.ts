import {studentNumber} from '@/lib/roster';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {z} from 'zod';
import {AppError,all,cookie,currentUser,digest,failure,fields,id,json,newSession,now,one,passwordHash,passwordMatches,rate,readJSON,run,sameOrigin,str,token} from '@/lib/campus';
export async function GET(req:Request){try{if(!env.DB)throw new AppError('数据库未配置',503);return json({user:await currentUser(env.DB,req)})}catch(e){return failure(e)}}
const credentials=z.object({username:z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{4,40}$/,'账号需为 4–40 位字母、数字或 ._-'),password:z.string().min(12,'密码至少 12 位').max(128,'密码过长')});
export async function POST(req:Request){try{
 sameOrigin(req);const db=env.DB;if(!db)throw new AppError('数据库未配置',503);const body=await readJSON(req);const ip=req.headers.get('cf-connecting-ip')||'local';
 if(body.action==='logout'){const user=await currentUser(db,req);const t=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('mf_session='))?.slice(11);if(user&&t)await run(db,'DELETE FROM sessions WHERE token=?',await digest(t));return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)})}
 if(body.action==='legacy'){
  const who=await getChatGPTUser();if(!who)throw new AppError('请先验证原ChatGPT身份',401);
  const linked=await one(db,'SELECT id FROM accounts WHERE id=?',who.userId);
  if(!linked){
   const old=await db.prepare('SELECT role,display_name FROM users WHERE id=?').bind(who.userId).first<{role:string;display_name:string}>();
   if(!old)throw new AppError('此身份没有已迁移的账号，请使用独立账号注册');
   await run(db,'INSERT INTO accounts(id,username,name,number,password,recovery,role,teacher_request,created) VALUES(?,?,?,?,?,?,?,?,?)',who.userId,'legacy_'+(await digest(who.userId)).slice(0,24),old.display_name,'未填写','!','!',old.role==='teacher'?'teacher':'student','none',now());
  }
  return json({ok:true},200,{'Set-Cookie':await newSession(db,who.userId,req)});
 }
 if(body.action==='owner'){
  const who=await getChatGPTUser();if(!who?.email||!env.ADMIN_EMAIL||who.email.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new AppError('仅网站所有者可启用管理员身份',403);
  const uid='owner:'+who.userId;await run(db,"INSERT INTO accounts(id,username,name,number,password,recovery,role,teacher_request,created) VALUES(?,?,?,?,?,?,'admin','none',?) ON CONFLICT(id) DO NOTHING",uid,'owner_'+(await digest(who.userId)).slice(0,12),who.fullName||'平台管理员','管理员','!','!',now());
  return json({ok:true},200,{'Set-Cookie':await newSession(db,uid,req)});
 }
 await rate(db,'auth-ip:'+await digest(ip),300);
 if(body.action==='register'){
  await rate(db,'register:'+await digest(ip),100,3600000);
  const student=body.portal==='student';const v=(student?credentials.extend({username:studentNumber,name:str(60),number:studentNumber}):credentials.extend({name:str(60),number:str(40)})).parse(body);if(student)throw new AppError('学生账号由老师根据名单开通，请直接使用学号与初始密码登录');const uid=id(),recovery=token();
  if(/^\d+$/.test(v.username))throw new AppError('纯数字账号保留给学生学号，请为教师使用含字母的账号');
  if(await one(db,'SELECT id FROM accounts WHERE username=?',v.username))throw new AppError('该账号不可用，请换一个');
  await run(db,"INSERT INTO accounts(id,username,name,number,password,recovery,created,teacher_request) VALUES(?,?,?,?,?,?,?,'pending')",uid,v.username,v.name,v.number,await passwordHash(v.password),await digest(recovery),now());
  return json({ok:true,recovery},200,{'Set-Cookie':await newSession(db,uid,req)});
 }
 if(body.action==='login'){
  const v=credentials.extend({password:z.string().min(6).max(128)}).parse(body);await rate(db,'login:'+await digest(v.username),12);
  const u=await one<{id:string;password:string;role:string;teacher_request:string}>(db,'SELECT id,password,role,teacher_request FROM accounts WHERE username=?',v.username);
  const match=await passwordMatches(v.password,u?.password||'pbkdf2$100000$unavailable$invalid');if(!u||!match)throw new AppError('账号或密码不正确',401);
  if(body.portal==='teacher'&&u.role==='student'&&u.teacher_request!=='pending'||body.portal==='student'&&u.role!=='student')throw new AppError('账号身份与登录入口不符，请切换入口',403);return json({ok:true},200,{'Set-Cookie':await newSession(db,u.id,req)});
 }
 if(body.action==='changePassword'){
  const u=await currentUser(db,req);if(!u)throw new AppError('请先登录',401);await rate(db,'password:'+u.id,5,60000);
  const v=z.object({currentPassword:z.string().min(6).max(128),password:z.string().min(12,'新密码至少 12 位').max(128)}).parse(body);
  const stored=await one<{password:string}>(db,'SELECT password FROM accounts WHERE id=?',u.id);
  if(!stored||!await passwordMatches(v.currentPassword,stored.password))throw new AppError('当前密码不正确',401);
  if(v.password===u.number.slice(-6)||v.password===u.username)throw new AppError('新密码不能使用学号');
  const recovery=token();await run(db,'UPDATE accounts SET password=?,must_change_password=0,recovery=? WHERE id=?',await passwordHash(v.password),await digest(recovery),u.id);await run(db,'DELETE FROM sessions WHERE user_id=?',u.id);
  return json({ok:true,recovery},200,{'Set-Cookie':await newSession(db,u.id,req)});
 }
 if(body.action==='recover'){
  const v=credentials.extend({recovery:z.string().regex(/^[a-f0-9]{64}$/,'恢复码格式不正确')}).parse(body);await rate(db,'recover:'+await digest(v.username),5,3600000);
  const recovery=token();const result=await run(db,'UPDATE accounts SET password=?,recovery=?,must_change_password=0 WHERE username=? AND recovery=?',await passwordHash(v.password),await digest(recovery),v.username,await digest(v.recovery));if(!result.meta.changes)throw new AppError('账号或恢复码不正确');
  await run(db,'DELETE FROM sessions WHERE user_id IN (SELECT id FROM accounts WHERE username=?)',v.username);return json({ok:true,recovery});
 }
 throw new AppError('不支持的操作');
 }catch(e){return failure(e)}}
