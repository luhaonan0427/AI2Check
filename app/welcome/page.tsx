import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { chatGPTSignInPath, getIdentity } from '@/app/chatgpt-auth';
import { findUser } from '@/db/store';
export const dynamic = 'force-dynamic';

export default async function Welcome() {
  const identity = await getIdentity();
  const user = identity ? await findUser(identity.userId) : null;
  const local = env.LOCAL_DEMO === 'true';
  return <main className="landing">
    <header className="landing-nav"><Link href="/welcome" className="brand"><span className="brand-icon">∑</span><div>数研 <small>MathFlow</small></div></Link><span className="landing-nav-note">为数学教学，留出思考的时间。</span></header>
    <div className="landing-hero">
      <section className="landing-copy"><p className="eyebrow">MATHEMATICS · FEEDBACK · GROWTH</p><h1>让每一步推导，<br />都得到回应<span>。</span></h1><p className="landing-lead">从一张手写作业开始，把发布、逐行反馈、订正和成绩连成一个完整的教学过程。让老师专注于判断，让学生知道下一步。</p>
        <div className="entry-actions">{identity ? <Link className="primary" href={user?.role === 'teacher' ? '/teacher' : '/student'}>进入{user?.role === 'teacher' ? '教师' : '学生'}端 →</Link> : <a className="primary" href={chatGPTSignInPath('/')} target="_top">使用 ChatGPT 登录 →</a>}</div>
        <p className="small muted">教师审核后定稿 · 手机拍照提交 · 多轮成绩汇总</p>
      </section>
      <section className="landing-notebook" aria-label="逐行反馈示意"><div className="notebook-head"><span>数学分析 · 解题过程</span><span className="tag green">界面示意</span></div>
        <div className="notebook-lines"><div><span>01</span><p>x² = x</p><i>✓</i></div><div><span>02</span><p>x(x − 1) = 0</p><i>✓</i></div><div className="notebook-error"><span>03</span><p>x − 1 = 0</p><b>首次出错</b></div></div>
        <div className="notebook-comment"><span className="eyebrow">第 3 行 · 条件遗漏</span><h3>除以 x 之前，先讨论 x = 0。</h3><p>这一步可能丢掉一个解。你能从第 2 行直接判断所有可能的取值吗？</p></div>
        <div className="notebook-footer"><span>定位 → 理解 → 订正</span><span>∴</span></div>
      </section>
    </div>
    <div className="landing-section-title"><p className="eyebrow">ONE COURSE, TWO WORKSPACES</p><h2>同一门课，两种清晰的工作方式</h2></div>
    <div className="role-cards">
      <section className="role-card teacher-role"><div className="role-index">01 / 教师端</div><h2>把精力放在审核与教学。</h2><p>发布题目和评分标准，按正确程度整理提交，对照原图确认或调整分数。</p><ul><li>课程码邀请学生 · 作业满分与权重</li><li>全对 / 部分正确 / 全错分类审核</li><li>每轮成绩与加权平时分 · CSV 导出</li></ul>{local ? <a href="/signin-with-chatgpt?as=teacher&return_to=/teacher" className="role-link">进入本地教师体验 →</a> : <span className="small muted">由管理员授权教师账号</span>}</section>
      <section className="role-card student-role"><div className="role-index">02 / 学生端</div><h2>知道哪里出错，也知道怎么继续。</h2><p>用课程码加入课程，拍照提交手写过程，从逐行反馈走向订正和新的挑战。</p><ul><li>手机拍照 · 多页上传与原图对照</li><li>页码与行号定位 · 分层订正提示</li><li>订正问答 · 巩固、提高与拓展题</li></ul>{local ? <a href="/signin-with-chatgpt?as=student_a&return_to=/student" className="role-link">进入本地学生体验 →</a> : <span className="small muted">登录后使用教师提供的课程码</span>}</section>
    </div>
    <footer className="landing-footer"><span>数研 MathFlow · 数学教学工作台</span><span>{local ? '本地体验账号仅用于开发测试' : 'AI 提供建议，教师确认最终成绩'}</span></footer>
  </main>;
}
