'use client';

// 我的作业 /student/course?id=<courseId>：
// 作业列表（截止时间、满分、题目、提交状态）+ 拍照提交 + 查看批改结果。

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Assignment, Submission, SubmissionStatus } from '@/app/domain';
import { effectiveScore, isReleased } from '@/app/domain';
import {
  apiGet,
  formatDueLabel,
  formatStamp,
  isPastDue,
  messageOf,
  statusOf,
  type CourseResponse,
} from './api';
import StudentShell from './student-shell';
import SubmitPanel from './submit-panel';
import GradeView from './grade-view';

const STATUS_STYLE: Record<SubmissionStatus, { label: string; tone: string }> = {
  pending: { label: '待批改', tone: 'tag orange' },
  graded: { label: '已批改待审核', tone: 'tag blue' },
  approved: { label: '已定稿', tone: 'tag green' },
};

type Props = {
  signInHref: string;
  signOutHref: string;
};

export default function CourseWork({ signInHref, signOutHref }: Props) {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('id') ?? '';

  const [data, setData] = useState<CourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!courseId) {
        setData(null);
        setError('缺少课程标识，请从「我的课程」进入。');
        setErrorStatus(400);
        setLoading(false);
        return;
      }
      if (!options?.silent) setLoading(true);
      try {
        const next = await apiGet<CourseResponse>(
          `/api/course?id=${encodeURIComponent(courseId)}`,
        );
        setData(next);
        setError(null);
        setErrorStatus(null);
      } catch (err) {
        setError(messageOf(err));
        setErrorStatus(statusOf(err));
      } finally {
        setLoading(false);
      }
    },
    [courseId],
  );

  useEffect(() => {
    // 用微任务错开 effect 同步阶段，避免在 effect 里同步 setState 触发级联渲染。
    void Promise.resolve().then(() => load());
  }, [load]);

  const assignments = data?.assignments ?? [];
  const submissions = data?.submissions ?? [];

  // 每份作业只保留自己最新的一条提交。
  const submissionByAssignment = new Map<string, Submission>();
  for (const submission of submissions) {
    submissionByAssignment.set(submission.assignmentId, submission);
  }

  const resultSubmission = resultId
    ? submissions.find((submission) => submission.id === resultId) ?? null
    : null;
  const resultAssignment = resultSubmission
    ? assignments.find((assignment) => assignment.id === resultSubmission.assignmentId) ?? null
    : null;

  const submittedCount = assignments.filter((assignment) =>
    submissionByAssignment.has(assignment.id),
  ).length;
  const approvedCount = assignments.filter((assignment) => {
    const submission = submissionByAssignment.get(assignment.id);
    return submission ? isReleased(submission) : false;
  }).length;

  /** 提交成功后：把新提交并入列表，并直接打开批改结果。 */
  function handleSubmitted(submission: Submission) {
    setData((prev) => {
      if (!prev) return prev;
      const others = prev.submissions.filter(
        (item) => item.id !== submission.id && item.assignmentId !== submission.assignmentId,
      );
      return { ...prev, submissions: [...others, submission] };
    });
    setSubmitTarget(null);
    setResultId(submission.id);
    setNotice(
      submission.status === 'pending'
        ? '提交成功：照片已保存，尚未完成 AI 批改。可稍后重试，或等待教师手动审核。'
        : '提交成功：已生成批改建议，尚未经教师确认，最终成绩以教师定稿为准。',
    );
  }

  return (
    <StudentShell
      title={data ? data.course.name : '我的作业'}
      subtitle="学生端 · 课程作业"
      active="course"
      courseId={courseId || null}
      signOutHref={signOutHref}
      actions={
        <button
          className="secondary"
          type="button"
          onClick={() => {
            void load();
          }}
          disabled={loading}
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      }
    >
      {error && data ? <p className="error-text">{error}</p> : null}

      {notice ? <p className="notice">{notice}</p> : null}

      {loading && !data ? (
        <section className="panel">
          <div className="empty">正在加载这门课的作业…</div>
        </section>
      ) : !data ? (
        <section className="panel">
          <p className="error-text">{error ?? '课程加载失败，请重试。'}</p>
          <div className="actions stu-actions" style={{ marginTop: 12 }}>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                void load();
              }}
            >
              重试
            </button>
            {errorStatus === 401 ? (
              <a className="primary" href={signInHref} target="_top">
                重新登录
              </a>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>{data.course.name}</h2>
                <p className="small muted">
                  {data.course.code}
                  {data.course.term ? ` · ${data.course.term}` : ''}
                </p>
              </div>
              <span className="tag neutral">共 {assignments.length} 份作业</span>
            </div>
            <div className="grid cols-3">
              <div className="stat">
                <span>作业数</span>
                <strong>{assignments.length}</strong>
              </div>
              <div className="stat">
                <span>已提交</span>
                <strong>{submittedCount}</strong>
              </div>
              <div className="stat">
                <span>教师已定稿</span>
                <strong>{approvedCount}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>我的作业</h2>
              <span className="hint">提交后可以随时查看批改结果</span>
            </div>

            {assignments.length === 0 ? (
              <div className="empty">
                <strong>这门课还没有作业</strong>
                教师发布作业后，这里会显示截止时间、满分与题目。
              </div>
            ) : (
              assignments.map((assignment) => {
                const submission = submissionByAssignment.get(assignment.id);
                const released = submission ? isReleased(submission) : false;
                const shownScore = submission ? effectiveScore(submission) : null;

                return (
                  <article className="stu-assignment" key={assignment.id}>
                    <div className="stu-assignment-head">
                      <div>
                        <h3>{assignment.title}</h3>
                        <div className="stu-meta">
                          <span>
                            截止 <strong>{formatDueLabel(assignment.due)}</strong>
                          </span>
                          <span>
                            满分 <strong>{assignment.maxScore}</strong>
                          </span>
                          <span>
                            权重 <strong>{assignment.weight}</strong>
                          </span>
                          {assignment.chapter ? <span>{assignment.chapter}</span> : null}
                          {!submission && isPastDue(assignment.due) ? (
                            <span className="tag red">已过截止</span>
                          ) : null}
                        </div>
                      </div>
                      {submission ? (
                        <span className={STATUS_STYLE[submission.status].tone}>
                          {STATUS_STYLE[submission.status].label}
                        </span>
                      ) : (
                        <span className="tag neutral">未提交</span>
                      )}
                    </div>

                    <p className="stu-questions">{assignment.questions}</p>

                    {submission ? (
                      <div className="stu-score-line">
                        <span>
                          {released ? '教师定稿成绩' : '批改建议分'}：
                          <strong>{shownScore ?? '—'}</strong> / {assignment.maxScore}
                        </span>
                        {released ? (
                          <span className="tag green">已定稿</span>
                        ) : (
                          <span className="tag orange">尚未经教师确认</span>
                        )}
                        <span className="muted small">
                          提交于 {formatStamp(submission.submittedAt)}
                        </span>
                      </div>
                    ) : (
                      <p className="small muted">
                        还没有提交。准备好后点「拍照提交」，最多 5 张照片。
                      </p>
                    )}

                    <div className="actions stu-actions">
                      {submission ? (
                        <button
                          className="primary"
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setResultId(submission.id);
                          }}
                        >
                          查看批改结果
                        </button>
                      ) : null}
                      <button
                        className={submission ? 'secondary' : 'primary'}
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setSubmitTarget(assignment);
                        }}
                      >
                        {submission ? '重新提交' : '拍照提交'}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </>
      )}

      {submitTarget ? (
        <SubmitPanel
          assignment={submitTarget}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={handleSubmitted}
        />
      ) : null}

      {resultSubmission && resultAssignment ? (
        <GradeView
          assignment={resultAssignment}
          submission={resultSubmission}
          pageError={error}
          onRefresh={() => load({ silent: true })}
          onClose={() => setResultId(null)}
        />
      ) : null}
    </StudentShell>
  );
}
