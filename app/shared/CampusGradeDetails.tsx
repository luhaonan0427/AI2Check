'use client';
import type {Grade} from '@/app/domain';
import AnswerPhoto from './AnswerPhoto';
import TutorPanel from './TutorPanel';
export default function CampusGradeDetails({submission,teacher=false}:{submission:{id:string;files:string[];ai_payload:string|null;status:string};teacher?:boolean}){
 let grade:Grade|null=null;try{grade=submission.ai_payload?JSON.parse(submission.ai_payload):null}catch{}
 if(grade&&!Array.isArray(grade.questions))grade=null;
 return <section className="campus-ai-details">
  {grade?<><div className="cm-ai-heading"><h3>AI 批改建议</h3><span className="cm-tag">{grade.score} / {grade.maxScore} · {grade.category}</span></div><p className="cm-help">{grade.summary}</p><p className="cm-help">建议分尚需教师核对。置信度 {Math.round(grade.confidence*100)}%{grade.needsReview?' · 存在不确定内容，请重点核查':''}</p>
  {grade.placeholder?<p className="cm-help">这是旧版占位演示，不代表真实AI识别结果，请由教师核对原图。</p>:null}
  {grade.questions.map(q=><article key={q.number} className="cm-ai-question"><h4>第 {q.number} 题 · {q.score} / {q.maxScore} 分</h4><p>{q.summary}</p>{(q.lines||[]).map((l,i)=><div key={i} className="cm-ai-line"><strong>第 {l.page||1} 页 · 第 {l.line} 行 {l.isFirstError?'· 首次出错':''}</strong><p>{l.text||'本行原文无法可靠识别'}</p><p>{l.issue||'本行未发现问题'} · 扣 {l.deduction} 分</p></div>)}</article>)}
  {grade.practice?<details className="cm-ai-question"><summary>订正练习 · {grade.practice.prompt}</summary>{grade.practice.hints.map((hint,i)=><details key={i}><summary>提示 {i+1}</summary><p>{hint}</p></details>)}<details><summary>参考要点</summary><p>{grade.practice.expected.join('；')}</p><p>{grade.practice.explain}</p></details></details>:null}
  {(grade.extensions||[]).map((e,i)=><article key={i} className="cm-ai-question"><span className="cm-tag">{e.level}</span><h4>{e.prompt}</h4><p>{e.goal}</p></article>)}
  {!grade.placeholder?<TutorPanel key={submission.id} submissionId={submission.id} readOnly={teacher} endpoint="/api/campus/tutor"/>:null}
  </>:<p className="cm-help">暂无 AI 批改结果。可以重试 AI 批改，或由教师手动评分。</p>}
  <div className="cm-review-photos">{submission.files.map((id,i)=><AnswerPhoto key={id} src={'/api/campus/files?id='+encodeURIComponent(id)} page={i+1} grade={grade} alt={`作业第${i+1}页`}/>)}</div>
 </section>;
}
