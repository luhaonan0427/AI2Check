import {z} from 'zod';
import {AppError,all,campusDatabase,digest,id,managedClass,now,one,passwordHash,User} from './campus';

export const studentNumber=z.string().trim().regex(/^\d{6,40}$/,'学号需为 6–40 位数字');
export function parseRoster(text:string){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(s=>s.trim());
 const rows=lines.map(line=>line.trim().split(/[,，\t ]+/));
 if(rows[0]?.some(s=>['学号','姓名','number','name'].includes(s)))rows.shift();
 if(!rows.length||rows.length>200)throw new AppError('每次导入 1–200 位学生，格式：学号,姓名');
 const seen=new Set<string>();
 return rows.map(c=>{if(c.length!==2)throw new AppError('每行需要两列：学号,姓名');const number=studentNumber.parse(c[0]),name=z.string().trim().min(1).max(60).parse(c[1]);if(seen.has(number))throw new AppError('名单中存在重复学号：'+number);seen.add(number);return {number,name}});
}
export async function importRoster(db:D1Database,u:User,classId:string,text:string){
 await managedClass(db,u,classId);const rows=parseRoster(text),statements=[];db=campusDatabase(db);
 for(const row of rows){
  const existing=await one<{id:string;role:string;number:string;name:string}>(db,'SELECT id,role,number,name FROM accounts WHERE username=?',row.number);
  if(existing&&(existing.role!=='student'||existing.number!==row.number||existing.name!==row.name))throw new AppError('学号已被其他账号使用或姓名不符：'+row.number);
  const uid=existing?.id||id();
  if(!existing)statements.push(db.prepare("INSERT INTO accounts(id,username,name,number,password,recovery,created,must_change_password) VALUES(?,?,?,?,?,?,?,1)").bind(uid,row.number,row.name,row.number,await passwordHash(row.number.slice(-6)),await digest(id()),now()));
  statements.push(db.prepare('INSERT INTO campus_roster(class_id,student_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(classId,uid));
 }
 await db.batch(statements);return {ok:true,imported:rows.length};
}
export async function roster(db:D1Database,u:User,classId:string){await managedClass(db,u,classId);return all(db,'SELECT a.id,a.name,a.number FROM campus_roster r JOIN accounts a ON a.id=r.student_id WHERE r.class_id=? ORDER BY a.number',classId)}
