import {env} from 'cloudflare:workers';
import {gradeSubmission,MAX_GRADING_IMAGE_BYTES} from '@/app/grader';
import {AppError, type User, assignment, enrolled, managedClass, one, campusDatabase, id} from './campus';
import type {Grade} from '@/app/domain';
export type CampusSubmission = {id:string;assignment_id:string;student_id:string;version:number;reviewed:number|null;status:string;files:string;answer:string;ai_payload:string|null;feedback:string};
export async function gradeContext(db:D1Database,u:User,sid:string){
 const s=await one<CampusSubmission>(db,'SELECT * FROM submissions WHERE id=?',sid);
 if(!s)throw new AppError('提交不存在',404);
 const a=await assignment(db,s.assignment_id);
 if(s.student_id===u.id)await enrolled(db,u,a.class_id);else await managedClass(db,u,a.class_id);
 return {s,a};
}
export async function gradeCampusSubmission(db:D1Database,u:User,sid:string){
 const {s,a}=await gradeContext(db,u,sid);
 if(s.status==='approved')throw new AppError('已定稿作业无需重新批改',400);
 const files=[];let totalBytes=0;
 for(const id of JSON.parse(s.files) as string[]){
  const upload=await one<{storage_key:string|null}>(db,'SELECT storage_key FROM uploads WHERE id=? AND owner=? AND assignment_id=?',id,s.student_id,a.id);
  if(!upload||!env.BUCKET)throw new AppError('原图暂不可用',503);
  const image=await env.BUCKET.get(upload.storage_key||'campus/'+id);
  if(!image)throw new AppError('原图不存在',404);
  totalBytes+=image.size;if(totalBytes>MAX_GRADING_IMAGE_BYTES){await image.body.cancel();throw new AppError('AI批改照片总大小需不超过16MB，请压缩照片或由教师手动审核',400)}
  files.push({id,bytes:await image.arrayBuffer(),contentType:image.httpMetadata?.contentType||'image/jpeg'});
 }
 const grade=await gradeSubmission({assignment:{id:a.id,title:a.title,maxScore:a.max_score,questions:a.body,rubric:a.rubric},studentId:s.student_id,files,answer:s.answer});
 const namespaced=campusDatabase(db);
 const result=await namespaced.batch([
  namespaced.prepare("UPDATE submissions SET ai_score=?,ai_payload=?,status=CASE WHEN status='returned' THEN 'returned' ELSE 'graded' END WHERE id=? AND version=? AND reviewed IS ? AND status<>'approved'").bind(grade.score,JSON.stringify(grade),sid,s.version,s.reviewed),
  namespaced.prepare("INSERT INTO submission_history(id,submission_id,actor,event,snapshot,created) SELECT ?,id,?,'ai',json_object('version',version,'ai_score',ai_score,'ai_payload',ai_payload,'status',status),? FROM submissions WHERE id=? AND changes()>0").bind(id(),u.id,Date.now(),sid)
 ]);
 if(!result[0].meta.changes)throw new AppError('提交或教师评分已更新，请刷新',409);
 return grade;
}
export function parseCampusGrade(payload:string|null):Grade|null{try{return payload?JSON.parse(payload):null}catch{return null}}
