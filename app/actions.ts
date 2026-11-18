import {z} from 'zod';
import {category,courses,students,type Store,type Submission} from './data';
export const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),course:z.enum(['analysis','algebra','probability']),title:z.string().trim().min(1).max(100),chapter:z.string().trim().max(100),due:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),max:z.number().min(1).max(1000),weight:z.number().positive().max(100),questions:z.string().trim().min(1).max(10000),rubric:z.string().trim().min(1).max(10000)}),
 z.object({action:z.literal('review'),id:z.string().max(100),score:z.number().min(0),feedback:z.string().trim().min(1).max(5000)}),
 z.object({action:z.literal('submit'),assignment:z.string().max(100),number:z.string().max(30),files:z.array(z.string().uuid()).min(1).max(10)}),
]);
export type Action=z.infer<typeof actionSchema>;
export function applyAction(current:Store,raw:unknown):Store{const input=actionSchema.parse(raw);const data=structuredClone(current);
if(input.action==='create'){if(!Number.isFinite(Date.parse(input.due)))throw new Error('截止时间无效');const {action,...assignment}=input;data.assignments.unshift({...assignment,id:crypto.randomUUID()});}
if(input.action==='review'){const s=data.submissions.find(s=>s.id===input.id);if(!s)throw new Error('找不到作业');const a=data.assignments.find(a=>a.id===s.assignment)!;if(input.score>a.max)throw new Error('分数不能超过满分');s.score=input.score;s.feedback=input.feedback;s.status='approved';s.category=category(input.score,a.max);}
if(input.action==='submit'){const a=data.assignments.find(a=>a.id===input.assignment);const student=students.find(s=>s[1]===input.number);if(!a||!student)throw new Error('课程或学生不存在');if(data.submissions.some(s=>s.assignment===a.id&&s.number===input.number))throw new Error('这位学生已提交该作业，请选择尚未提交的作业');data.submissions.push({id:crypto.randomUUID(),assignment:a.id,student:student[0],number:student[1],score:null,aiScore:null,status:'pending',demo:false,category:'待判断',feedback:'图片已保存，等待教师批改。AI 接口尚未启用。',files:input.files,submitted:new Date().toISOString()});}
return data;}
export function totals(data:Store,course:string){const assignments=data.assignments.filter(a=>a.course===course);return students.map(([name,number])=>{const entries=assignments.map(a=>({assignment:a,submission:data.submissions.find(s=>s.assignment===a.id&&s.number===number)}));const approved=entries.filter(e=>e.submission?.status==='approved');const weight=approved.reduce((v,e)=>v+e.assignment.weight,0);const average=weight?approved.reduce((v,e)=>v+e.submission!.score!/e.assignment.max*100*e.assignment.weight,0)/weight:null;return {name,number,entries,approved:approved.length,average,complete:assignments.length>0&&approved.length===assignments.length};});}
export function csvCell(value:string|number){let text=String(value);if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
