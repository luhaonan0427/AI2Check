// Live local-only integration check; disposable records are removed in finally.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
const base='http://localhost:5173',dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const files=readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&!f.startsWith('metadata'));assert.equal(files.length,1);
const db=new DatabaseSync(dir+'/'+files[0]),uid=[],classIds=[];
function client(){let cookie='';return async(path,body)=>{const r=await fetch(base+path,{headers:{Origin:base,...body?{'Content-Type':'application/json'}:{},Cookie:cookie},...body?{method:'POST',body:JSON.stringify(body)}:{}});const ck=r.headers.get('set-cookie');if(ck)cookie=ck.split(';')[0];return {status:r.status,data:await r.json()}}}
const teacher=client(),student=client(),outsider=client();
const number=String(Date.now()).slice(-12),name='集成检查学生',pw='Classroom-Test-Password-2026';
try{
 let r=await teacher('/api/account',{action:'register',portal:'teacher',username:'check_'+number,name:'检查教师',number:'T'+number,password:pw});assert.equal(r.status,200);
 const t=(await teacher('/api/account')).data.user;uid.push(t.id);db.prepare("UPDATE campus_accounts SET role='teacher',teacher_request='approved' WHERE id=?").run(t.id);
 r=await teacher('/api/campus',{action:'createClass',name:'自动检查班级'});assert.equal(r.status,200);
 let state=(await teacher('/api/campus')).data;const c=state.classes.find(c=>c.name==='自动检查班级');classIds.push(c.id);
 r=await teacher('/api/campus',{action:'importRoster',classId:c.id,text:number+','+name});assert.equal(r.status,200);
 const s=db.prepare('SELECT id FROM campus_accounts WHERE username=?').get(number);uid.push(s.id);
 r=await student('/api/account',{action:'login',portal:'student',username:number,password:number.slice(-6)});assert.equal(r.status,200);
 assert.equal((await student('/api/account')).data.user.must_change_password,1);
 assert.equal((await student('/api/campus')).status,403);
 r=await outsider('/api/account',{action:'login',portal:'teacher',username:number,password:number.slice(-6)});assert.equal(r.status,403);
 r=await student('/api/account',{action:'changePassword',currentPassword:number.slice(-6),password:pw});assert.equal(r.status,200);assert(r.data.recovery);
 assert.equal((await student('/api/account')).data.user.must_change_password,0);
 r=await student('/api/campus',{action:'join',code:c.code});assert.equal(r.status,200);
 state=(await teacher('/api/campus')).data;assert(state.members.some(m=>m.user_id===s.id&&m.status==='pending'));
 r=await teacher('/api/campus',{action:'enrollment',enrollmentId:c.id+':'+s.id,approve:true});assert.equal(r.status,200);
 r=await teacher('/api/campus',{action:'createAssignment',classId:c.id,title:'积分检查',body:'## 求积分\n$$\\int_0^1 x\\,dx$$',rubric:'教师答案',maxScore:100,weight:1,deadline:1,allowLate:false});assert.equal(r.status,200);const aid=r.data.assignmentId;assert(aid);
 state=(await teacher('/api/campus')).data;const a=state.assignments.find(a=>a.id===aid);assert.equal(a.deadline-a.created,604800000);
 db.prepare("UPDATE campus_assignments SET ai_solution='SECRET SOLUTION',solution_status='ready' WHERE id=?").run(aid);
 const studentA=(await student('/api/campus')).data.assignments[0];assert.equal(studentA.ai_solution,undefined);assert.equal(studentA.rubric,undefined);
 r=await student('/api/campus/solution',{assignmentId:aid});assert.equal(r.status,403);
 r=await student('/api/campus',{action:'submit',assignmentId:aid,answer:'1/2',files:[],version:0});assert.equal(r.status,200);
 state=(await teacher('/api/campus')).data;const sub=state.submissions.find(s=>s.assignment_id===aid);
 r=await teacher('/api/campus',{action:'grade',submissionId:sub.id,version:1,reviewed:null,score:90,feedback:'已核查',returned:false});assert.equal(r.status,200);
 state=(await student('/api/campus')).data;assert.equal(state.submissions[0].score,90);
 assert.equal((await student('/api/campus?history='+encodeURIComponent(sub.id))).data.history.length,2);
 console.log('PASS HTTP: role portals, roster account, forced password change, join notification/approval, seven-day deadline, private reference solution, submission, final score and history.');
}finally{
 db.exec('BEGIN');try{
  for(const classId of classIds){
   for(const table of ['campus_tutor_messages','campus_submission_history'])db.prepare(`DELETE FROM ${table} WHERE submission_id IN (SELECT s.id FROM campus_submissions s JOIN campus_assignments a ON a.id=s.assignment_id WHERE a.class_id=?)`).run(classId);
   for(const table of ['campus_uploads','campus_submissions'])db.prepare(`DELETE FROM ${table} WHERE assignment_id IN (SELECT id FROM campus_assignments WHERE class_id=?)`).run(classId);
   for(const table of ['campus_assignments','campus_enrollments','campus_roster'])db.prepare(`DELETE FROM ${table} WHERE class_id=?`).run(classId);
   const c=db.prepare('SELECT course_id FROM campus_classes WHERE id=?').get(classId);db.prepare('DELETE FROM campus_classes WHERE id=?').run(classId);if(c)db.prepare('DELETE FROM campus_courses WHERE id=?').run(c.course_id);
  }
  for(const id of uid){db.prepare('DELETE FROM campus_sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM campus_accounts WHERE id=?').run(id)}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}finally{db.close()}
}
