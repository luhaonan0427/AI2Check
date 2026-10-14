import {z} from 'zod';
import {AppError,User,all,assignment,canSubmit,enrolled,fields,id,managedClass,now,one,run,str,token,uuid} from './campus';
import {campusDatabase} from './campus';
type Row=Record<string,any>;
export async function snapshot(db:D1Database,u:User){
 db=campusDatabase(db);
 const teacher=u.role==='teacher'||u.role==='admin';
 const cs=await all<Row>(db,teacher?'SELECT * FROM courses WHERE owner=? OR ?=\'admin\' ORDER BY created DESC':"SELECT DISTINCT c.* FROM courses c JOIN classes cl ON cl.course_id=c.id JOIN enrollments e ON e.class_id=cl.id WHERE e.user_id=? ORDER BY c.created DESC",...teacher?[u.id,u.role]:[u.id]);
 const cls=await all<Row>(db,teacher?"SELECT cl.* FROM classes cl JOIN courses c ON c.id=cl.course_id WHERE c.owner=? OR ?='admin'":"SELECT cl.id,cl.course_id,cl.name,cl.open,e.status AS membership FROM classes cl JOIN enrollments e ON e.class_id=cl.id WHERE e.user_id=?",...teacher?[u.id,u.role]:[u.id]);
 const assignments=await all<Row>(db,teacher?"SELECT a.* FROM assignments a JOIN classes cl ON cl.id=a.class_id JOIN courses c ON c.id=cl.course_id WHERE c.owner=? OR ?='admin' ORDER BY a.created DESC":"SELECT a.id,a.class_id,a.title,a.body,a.deadline,a.max_score,a.weight,a.allow_late,a.created FROM assignments a JOIN enrollments e ON e.class_id=a.class_id WHERE e.user_id=? AND e.status='active' ORDER BY a.created DESC",...teacher?[u.id,u.role]:[u.id]);
 const submissions=await all<Row>(db,teacher?"SELECT s.*,u.name,u.number FROM submissions s JOIN accounts u ON u.id=s.student_id JOIN assignments a ON a.id=s.assignment_id JOIN classes cl ON cl.id=a.class_id JOIN courses c ON c.id=cl.course_id WHERE c.owner=? OR ?='admin' ORDER BY s.submitted DESC":"SELECT * FROM submissions WHERE student_id=? ORDER BY submitted DESC",...teacher?[u.id,u.role]:[u.id]);
 const members=teacher?await all<Row>(db,"SELECT e.*,u.name,u.number,u.username FROM enrollments e JOIN accounts u ON u.id=e.user_id JOIN classes cl ON cl.id=e.class_id JOIN courses c ON c.id=cl.course_id WHERE c.owner=? OR ?='admin' ORDER BY e.created DESC",u.id,u.role):[];
 const requests=u.role==='admin'?await all(db,`SELECT ${fields} FROM accounts WHERE teacher_request='pending' ORDER BY created`):[];
 return {user:u,courses:cs,classes:cls,assignments,submissions:submissions.map((s):Row=>({...s,files:JSON.parse(s.files)})),members,requests};
}
export async function action(db:D1Database,u:User,raw:unknown){
 db=campusDatabase(db);
 const b=z.object({action:str(40)}).passthrough().parse(raw);
 switch(b.action){
 case 'profile':{const v=z.object({name:str(60),number:str(40)}).parse(b);await run(db,'UPDATE accounts SET name=?,number=? WHERE id=?',v.name,v.number,u.id);break}
 case 'requestTeacher':{if(u.role!=='student')throw new AppError('当前身份无需申请');await run(db,"UPDATE accounts SET teacher_request='pending' WHERE id=?",u.id);break}
 case 'approveTeacher':{if(u.role!=='admin')throw new AppError('仅管理员可审核教师',403);const v=z.object({userId:str(150),approve:z.boolean()}).parse(b);await run(db,"UPDATE accounts SET role=?,teacher_request=? WHERE id=? AND teacher_request='pending'",v.approve?'teacher':'student',v.approve?'approved':'rejected',v.userId);break}
 case 'createCourse':{if(!['teacher','admin'].includes(u.role))throw new AppError('需先通过教师审核',403);const v=z.object({title:str(100),term:str(60),description:z.string().trim().max(2000)}).parse(b);await run(db,'INSERT INTO courses(id,owner,title,term,description,created) VALUES(?,?,?,?,?,?)',id(),u.id,v.title,v.term,v.description,now());break}
 case 'createClass':{const v=z.object({courseId:uuid,name:str(80)}).parse(b);const c=await one<Row>(db,'SELECT * FROM courses WHERE id=?',v.courseId);if(!c||(c.owner!==u.id&&u.role!=='admin'))throw new AppError('无权管理该课程',403);await run(db,'INSERT INTO classes(id,course_id,name,code) VALUES(?,?,?,?)',id(),v.courseId,v.name,token().slice(0,10).toUpperCase());break}
 case 'classSettings':{const v=z.object({classId:uuid,open:z.boolean(),rotate:z.boolean().optional()}).parse(b);await managedClass(db,u,v.classId);await run(db,v.rotate?'UPDATE classes SET open=?,code=? WHERE id=?':'UPDATE classes SET open=? WHERE id=?',...v.rotate?[Number(v.open),token().slice(0,10).toUpperCase(),v.classId]:[Number(v.open),v.classId]);break}
 case 'join':{const v=z.object({code:z.string().trim().toUpperCase().regex(/^[A-F0-9]{10}$/,'请输入 10 位班级码')}).parse(b);if(u.role!=='student')throw new AppError('请使用学生账号加入班级');const c=await one<Row>(db,'SELECT id FROM classes WHERE code=? AND open=1',v.code);if(!c)throw new AppError('班级码无效或已关闭加入');await run(db,"INSERT INTO enrollments(id,class_id,user_id,status,created) VALUES(?,?,?,'pending',?) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN status='rejected' THEN 'pending' ELSE status END",c.id+':'+u.id,c.id,u.id,now());break}
 case 'enrollment':{const v=z.object({enrollmentId:str(100),approve:z.boolean()}).parse(b);const e=await one<Row>(db,'SELECT * FROM enrollments WHERE id=?',v.enrollmentId);if(!e)throw new AppError('申请不存在');await managedClass(db,u,e.class_id);await run(db,"UPDATE enrollments SET status=? WHERE id=? AND status='pending'",v.approve?'active':'rejected',v.enrollmentId);break}
 case 'createAssignment':{const v=z.object({classId:uuid,title:str(150),body:str(20000),rubric:z.string().max(10000),deadline:z.number().int().min(now(),'截止时间需晚于当前时间'),maxScore:z.number().int().min(1).max(1000),weight:z.number().positive().max(100),allowLate:z.boolean()}).parse(b);await managedClass(db,u,v.classId);await run(db,'INSERT INTO assignments(id,class_id,title,body,rubric,deadline,max_score,weight,allow_late,created) VALUES(?,?,?,?,?,?,?,?,?,?)',id(),v.classId,v.title,v.body,v.rubric,v.deadline,v.maxScore,v.weight,Number(v.allowLate),now());break}
 case 'submit':{
  const v=z.object({assignmentId:uuid,answer:z.string().trim().max(20000),files:z.array(uuid).max(10),version:z.number().int().min(0)}).parse(b);if(!v.answer&&!v.files.length)throw new AppError('请上传作业照片或填写解答');
  const a=await assignment(db,v.assignmentId);await enrolled(db,u,a.class_id);const sid=a.id+':'+u.id;const old=await one<Row>(db,'SELECT * FROM submissions WHERE id=?',sid);canSubmit(a,old?.status);if((old?.version||0)!==v.version)throw new AppError('作业已更新，请刷新后再提交',409);
  for(const file of v.files)if(!await one(db,'SELECT id FROM uploads WHERE id=? AND owner=? AND assignment_id=?',file,u.id,a.id))throw new AppError('附件无效，请重新上传');
  const time=now(),files=JSON.stringify(v.files),version=v.version+1;
  // Snapshot is written from the updated row, inside the same D1 transaction.
  const write=old?db.prepare("UPDATE submissions SET files=?,answer=?,version=?,status='pending',score=NULL,feedback='',submitted=?,reviewed=NULL,ai_score=NULL,ai_payload=NULL WHERE id=? AND version=?").bind(files,v.answer,version,time,sid,v.version):db.prepare("INSERT OR IGNORE INTO submissions(id,assignment_id,student_id,files,answer,version,status,feedback,submitted) VALUES(?,?,?,?,?,1,'pending','',?)").bind(sid,a.id,u.id,files,v.answer,time);
  const result=await db.batch([write,db.prepare("INSERT INTO submission_history(id,submission_id,actor,event,snapshot,created) SELECT ?,id,?,'submit',json_object('version',version,'files',json(files),'answer',answer,'status',status),? FROM submissions WHERE id=? AND changes()>0").bind(id(),u.id,time,sid)]);
  if(!result[0].meta.changes)throw new AppError('作业已更新，请刷新后重试',409);break;
 }
 case 'grade':{
  const v=z.object({submissionId:str(100),version:z.number().int(),reviewed:z.number().nullable(),score:z.number().min(0).max(1000),feedback:str(10000),returned:z.boolean()}).parse(b);const s=await one<Row>(db,'SELECT * FROM submissions WHERE id=?',v.submissionId);if(!s)throw new AppError('提交不存在');const a=await assignment(db,s.assignment_id);await managedClass(db,u,a.class_id);if(v.score>a.max_score)throw new AppError('分数不能超过满分');const time=now();
  const result=await db.batch([db.prepare('UPDATE submissions SET score=?,feedback=?,status=?,reviewed=? WHERE id=? AND version=? AND reviewed IS ?').bind(v.score,v.feedback,v.returned?'returned':'approved',time,s.id,v.version,v.reviewed),db.prepare("INSERT INTO submission_history(id,submission_id,actor,event,snapshot,created) SELECT ?,id,?,'grade',json_object('version',version,'score',score,'feedback',feedback,'status',status,'ai_score',ai_score,'ai_payload',ai_payload),? FROM submissions WHERE id=? AND changes()>0").bind(id(),u.id,time,s.id)]);if(!result[0].meta.changes)throw new AppError('学生已重新提交或评分已更新，请刷新后批改',409);break;
 }
 default:throw new AppError('不支持的操作');
 }
 return {ok:true};
}
export async function submissionHistory(db:D1Database,u:User,sid:string){const s=await one<Row>(db,'SELECT * FROM submissions WHERE id=?',sid);if(!s)throw new AppError('提交不存在',404);if(s.student_id!==u.id){const a=await assignment(db,s.assignment_id);await managedClass(db,u,a.class_id)}return all(db,'SELECT event,snapshot,created FROM submission_history WHERE submission_id=? ORDER BY created DESC',sid)}
