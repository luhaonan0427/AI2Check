'use client';

// 课程管理页：发布作业、查看作业列表、按作业与状态筛选全班提交、打开批改审核面板定稿。
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import type { Assignment, Submission, SubmissionStatus } from '@/app/domain';
import { effectiveScore, isReleased } from '@/app/domain';
import { apiGet, apiPost, errorMessage } from './api';
import { CopyButton } from './CopyButton';
import { GradeReview } from './GradeReview';
import { PlaceholderNotice } from './PlaceholderNotice';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './StateBlocks';
import { TeacherShell } from './TeacherShell';
import {
  categoryTagClass,
  formatDateTime,
  scoreText,
  statusLabel,
  statusTagClass,
} from './format';
import type { CourseDetailResponse, MeResponse } from './types';

const EMPTY_FORM = {
  title: '',
  chapter: '',
  due: '',
  maxScore: '100',
  weight: '1',
  questions: '',
  rubric: '',
};

type StatusFilter = 'all' | SubmissionStatus;

export function CourseWorkspace({ courseId }: { courseId: string }) {
  const [detail, setDetail] = useState<CourseDetailResponse | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [regradingId, setRegradingId] = useState('');

  async function regrade(submissionId: string) {
    setRegradingId(submissionId); setError('');
    try { await apiPost('/api/submission', { action: 'regrade', submissionId }); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setRegradingId(''); }
  }
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try {
      const [course, me] = await Promise.all([
        apiGet<CourseDetailResponse>(`/api/course?id=${encodeURIComponent(courseId)}`),
        apiGet<MeResponse>('/api/me').catch(() => null),
      ]);
      setDetail(course);
      setUserName(me?.user.displayName ?? '');
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    // load 的 setState 都发生在 await 之后；放进微任务，避免被判定为 effect 同步阶段写状态。
    void Promise.resolve().then(() => load());
  }, [courseId, load]);

  /** 手动刷新：由点击触发，这里显式进入加载态。 */
  async function handleRefresh() {
    setLoading(true);
    setError('');
    await load();
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publishing) return;

    const title = form.title.trim();
    const questions = form.questions.trim();
    const rubric = form.rubric.trim();
    const maxScore = Number(form.maxScore);
    const weight = Number(form.weight);

    if (!title) {
      setPublishError('请填写作业标题');
      return;
    }
    if (!form.due) {
      setPublishError('请选择截止时间');
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) {
      setPublishError('满分需在 1-1000 之间');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setPublishError('权重需在 0-100 之间');
      return;
    }
    if (!questions) {
      setPublishError('请填写题目内容');
      return;
    }
    if (!rubric) {
      setPublishError('请填写评分标准');
      return;
    }

    setPublishing(true);
    setPublishError('');
    setFlash('');
    try {
      const result = await apiPost<{ assignment: Assignment }>('/api/assignments', {
        op: 'create',
        courseId,
        title,
        chapter: form.chapter.trim() || null,
        due: form.due,
        maxScore,
        weight,
        questions,
        rubric,
      });
      setDetail((current) =>
        current
          ? { ...current, assignments: [result.assignment, ...current.assignments] }
          : current,
      );
      setFlash(`作业「${result.assignment.title}」已发布，学生端可以提交了。`);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setPublishError(errorMessage(caught));
    } finally {
      setPublishing(false);
    }
  }

  function handleSaved(updated: Submission) {
    setDetail((current) =>
      current
        ? {
            ...current,
            submissions: current.submissions.map((item) => (item.id === updated.id ? updated : item)),
          }
        : current,
    );
    setReviewingId(null);
    setFlash(
      `已定稿：${updated.studentName} 最终 ${scoreText(updated.finalScore)} 分` +
        (updated.category ? `（${updated.category}）` : '') +
        '。',
    );
  }

  if (!courseId) {
    return (
      <TeacherShell active="course" title="课程管理" userName={userName || undefined}>
        <section className="panel">
          <EmptyBlock title="请先选择一门课程" hint={<Link href="/teacher">返回我的课程</Link>} />
        </section>
      </TeacherShell>
    );
  }

  const assignments = detail?.assignments ?? [];
  const submissions = detail?.submissions ?? [];
  const students = detail?.students ?? [];

  const assignmentById = new Map(assignments.map((item) => [item.id, item]));
  const submissionCount = new Map<string, number>();
  for (const submission of submissions) {
    submissionCount.set(submission.assignmentId, (submissionCount.get(submission.assignmentId) ?? 0) + 1);
  }

  const filtered = submissions.filter(
    (submission) =>
      (assignmentFilter === 'all' || submission.assignmentId === assignmentFilter) &&
      (statusFilter === 'all' || submission.status === statusFilter) &&
      (categoryFilter === 'all' || submission.category === categoryFilter || (categoryFilter === 'unclassified' && !submission.category)),
  );

  const reviewing = submissions.find((submission) => submission.id === reviewingId) ?? null;
  const reviewingAssignment = reviewing ? assignmentById.get(reviewing.assignmentId) ?? null : null;
  const pendingCount = submissions.filter((submission) => submission.status !== 'approved').length;
  const hasPlaceholder = submissions.some((submission) => submission.aiPayload?.placeholder === true);

  function focusSubmissions(assignmentId: string) {
    setAssignmentFilter(assignmentId);
    setStatusFilter('all');
    setCategoryFilter('all');
    document.getElementById('submissions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <TeacherShell
      active="course"
      title={detail ? detail.course.name : '课程管理'}
      subtitle={detail ? `${assignments.length} 次作业 · ${submissions.length} 份提交` : undefined}
      userName={userName || undefined}
    >
      {loading ? <LoadingBlock label="正在加载课程数据…" /> : null}

      {!loading && error ? (
        <>
          <ErrorBlock message={`加载课程失败：${error}`} onRetry={() => void load()} />
          <section className="panel">
            <EmptyBlock title="无法显示这门课程" hint={<Link href="/teacher">返回我的课程</Link>} />
          </section>
        </>
      ) : null}

      {!loading && !error && detail ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">课程管理</p>
                <h2>{detail.course.name}</h2>
                <p className="small muted">
                  {detail.course.code}
                  {detail.course.term ? ` · ${detail.course.term}` : ''} · {students.length} 名学生 ·{' '}
                  {assignments.length} 次作业
                </p>
              </div>
              <div className="actions">
                <Link className="secondary" href="/teacher">
                  返回课程列表
                </Link>
                <Link className="secondary" href={`/teacher/stats?id=${encodeURIComponent(courseId)}`}>
                  成绩统计
                </Link>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleRefresh()}
                  disabled={loading}
                >
                  刷新
                </button>
              </div>
            </div>
            <div className="copy-row">
              <span className="course-code">{detail.course.joinCode}</span>
              <CopyButton value={detail.course.joinCode} />
              <span className="small muted">把课程码发给学生，学生即可加入这门课程。</span>
            </div>
          </section>

          {flash ? (
            <p className="ok-text" role="status">
              {flash}
            </p>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2>发布作业</h2>
              <span className="small muted">截止时间格式：年-月-日 时:分</span>
            </div>
            <form className="stack" onSubmit={handlePublish}>
              <div className="field-row">
                <label className="field" htmlFor="assignment-title">
                  标题
                  <input
                    id="assignment-title"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    maxLength={100}
                    placeholder="例如：第三次作业：极限与连续"
                    disabled={publishing}
                  />
                </label>
                <label className="field" htmlFor="assignment-chapter">
                  章节
                  <input
                    id="assignment-chapter"
                    value={form.chapter}
                    onChange={(event) => setForm({ ...form, chapter: event.target.value })}
                    maxLength={100}
                    placeholder="例如：第二章 · 函数极限"
                    disabled={publishing}
                  />
                </label>
                <label className="field" htmlFor="assignment-due">
                  截止时间
                  <input
                    id="assignment-due"
                    type="datetime-local"
                    value={form.due}
                    onChange={(event) => setForm({ ...form, due: event.target.value })}
                    disabled={publishing}
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field" htmlFor="assignment-max">
                  满分
                  <input
                    id="assignment-max"
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    value={form.maxScore}
                    onChange={(event) => setForm({ ...form, maxScore: event.target.value })}
                    disabled={publishing}
                  />
                </label>
                <label className="field" htmlFor="assignment-weight">
                  权重
                  <input
                    id="assignment-weight"
                    type="number"
                    min={0.1}
                    max={100}
                    step={0.1}
                    value={form.weight}
                    onChange={(event) => setForm({ ...form, weight: event.target.value })}
                    disabled={publishing}
                  />
                  <span className="hint">统计时先按满分归一化，再按权重加权。</span>
                </label>
              </div>

              <label className="field" htmlFor="assignment-questions">
                题目
                <textarea
                  id="assignment-questions"
                  rows={4}
                  value={form.questions}
                  onChange={(event) => setForm({ ...form, questions: event.target.value })}
                  placeholder={'每行一题，例如：\n1. 计算 lim(x→0) sin(x)/x，并说明使用的定理。'}
                  disabled={publishing}
                />
                <span className="hint">按「1. 2. 3.」分行书写，批改时会按题拆分。</span>
              </label>

              <label className="field" htmlFor="assignment-rubric">
                评分标准
                <textarea
                  id="assignment-rubric"
                  rows={3}
                  value={form.rubric}
                  onChange={(event) => setForm({ ...form, rubric: event.target.value })}
                  placeholder="例如：第1题30分；第2题20分；第3题50分。认可正确的不同解法。"
                  disabled={publishing}
                />
              </label>

              {publishError ? (
                <p className="error-text" role="alert">
                  {publishError}
                </p>
              ) : null}

              <div className="actions">
                <button type="submit" className="primary" disabled={publishing}>
                  {publishing ? '发布中…' : '发布作业'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>作业列表</h2>
              <span className="small muted">共 {assignments.length} 次作业</span>
            </div>
            {assignments.length === 0 ? (
              <EmptyBlock title="还没有发布作业" hint="用上面的表单发布第一次作业，学生端就会出现提交入口。" />
            ) : (
              <div>
                {assignments.map((assignment) => (
                  <article className="assignment-row" key={assignment.id}>
                    <div className="assignment-body">
                      <strong className="block">{assignment.title}</strong>
                      <div className="assignment-meta">
                        {assignment.chapter ? <span className="tag neutral">{assignment.chapter}</span> : null}
                        <span className="small muted">截止 {formatDateTime(assignment.due)}</span>
                        <span className="small muted">
                          满分 {assignment.maxScore} · 权重 {assignment.weight}
                        </span>
                        <span className="small muted">已收到 {submissionCount.get(assignment.id) ?? 0} 份</span>
                      </div>
                      <details>
                        <summary>查看题目与评分标准</summary>
                        <p className="plain-text">{assignment.questions}</p>
                        <p className="plain-text">{assignment.rubric}</p>
                      </details>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => focusSubmissions(assignment.id)}
                    >
                      只看这次作业的提交
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel" id="submissions-panel">
            <div className="panel-head">
              <h2>提交与审核</h2>
              <span className="small muted">
                共 {submissions.length} 份 · 待审核 {pendingCount} 份
              </span>
            </div>

            {hasPlaceholder ? <PlaceholderNotice /> : null}

            {students.length > 0 ? (
              <details className="roster">
                <summary>学生名单（{students.length}）</summary>
                <ul>
                  {students.map((student) => {
                    const mine = submissions.filter((item) => item.studentId === student.studentId);
                    const approved = mine.filter((item) => isReleased(item)).length;
                    return (
                      <li key={student.studentId}>
                        <span>
                          {student.displayName}
                          <span className="muted">{student.studentNumber ? ` · ${student.studentNumber}` : ''}</span>
                        </span>
                        <span className="muted">
                          提交 {mine.length}/{assignments.length} · 已审 {approved}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}

            <div className="filters">
              <label className="field" htmlFor="filter-category">按正确程度筛选
                <select id="filter-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">全部分类</option>
                  <option value="全对">全对</option><option value="部分正确">部分正确</option><option value="全错">全错</option><option value="unclassified">尚未分类</option>
                </select>
              </label>
              <label className="field" htmlFor="filter-assignment">
                按作业筛选
                <select
                  id="filter-assignment"
                  value={assignmentFilter}
                  onChange={(event) => setAssignmentFilter(event.target.value)}
                >
                  <option value="all">全部作业（{assignments.length}）</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="filter-status">
                按状态筛选
                <select
                  id="filter-status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">全部状态</option>
                  <option value="pending">待批改</option>
                  <option value="graded">待审核</option>
                  <option value="approved">已定稿</option>
                </select>
              </label>
              <span className="small muted">
                当前显示 {filtered.length} / {submissions.length} 份
              </span>
            </div>

            {submissions.length === 0 ? (
              <EmptyBlock title="还没有学生提交" hint="学生上传作业照片后，这里会出现待审核的记录。" />
            ) : filtered.length === 0 ? (
              <EmptyBlock title="当前筛选没有记录" hint="换一个作业或状态再试。" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>作业</th>
                      <th>状态</th>
                      <th>分数</th>
                      <th>提交时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((submission) => {
                      const assignment = assignmentById.get(submission.assignmentId) ?? null;
                      const current = effectiveScore(submission);
                      const approved = isReleased(submission);
                      return (
                        <tr key={submission.id}>
                          <td>
                            <strong>{submission.studentName}</strong>
                            <span className="small muted block">
                              {submission.studentNumber ? `学号 ${submission.studentNumber}` : '未填学号'}
                            </span>
                          </td>
                          <td>
                            {assignment ? assignment.title : '已删除的作业'}
                            <span className="small muted block">
                              {assignment ? `满分 ${assignment.maxScore} · 权重 ${assignment.weight}` : '—'}
                            </span>
                          </td>
                          <td>
                            {submission.category ? <span className={categoryTagClass(submission.category)}>{submission.category}</span> : null}
                            {submission.aiPayload?.needsReview ? <span className="tag orange">需重点核查</span> : null}
                            <span className={statusTagClass(submission.status)}>
                              {statusLabel(submission.status)}
                            </span>
                            {submission.aiPayload?.placeholder === true ? (
                              <span className="placeholder-flag">占位批改</span>
                            ) : null}
                          </td>
                          <td>
                            <strong>{scoreText(current)}</strong>
                            {assignment ? <span className="small muted"> / {assignment.maxScore}</span> : null}
                            {approved ? (
                              submission.category ? (
                                <span className="block">
                                  <span className={categoryTagClass(submission.category)}>
                                    {submission.category}
                                  </span>
                                </span>
                              ) : null
                            ) : submission.aiScore != null ? (
                              <span className="small muted block">建议分，未计入均分</span>
                            ) : null}
                          </td>
                          <td className="small muted">{formatDateTime(submission.submittedAt)}</td>
                          <td>
                            {!approved ? <button type="button" className="secondary" disabled={Boolean(regradingId)} onClick={() => { void regrade(submission.id); }}>{regradingId === submission.id ? '批改中…' : 'AI 批改'}</button> : null}
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setFlash('');
                                setReviewingId(submission.id);
                              }}
                            >
                              {approved ? '查看 / 改分' : '审核'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {reviewing && reviewingAssignment ? (
        <GradeReview
          key={reviewing.id}
          submission={reviewing}
          assignment={reviewingAssignment}
          onCancel={() => setReviewingId(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </TeacherShell>
  );
}
