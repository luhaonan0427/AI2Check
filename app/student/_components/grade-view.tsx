'use client';

// 批改结果：教师已定稿（status=approved）才显示为最终成绩；
// 未定稿时用 effectiveScore() 取批改建议分，并明确标注「尚未经教师确认」。
// 逐题得分 + 逐行错误定位（第几行/问题/扣分）+ 订正练习（提示逐条展开）+ 拓展题。

import { useState } from 'react';
import type {
  Assignment,
  Extension,
  Grade,
  Practice,
  QuestionAssessment,
  Submission,
} from '@/app/domain';
import { effectiveScore, isReleased } from '@/app/domain';
import { formatStamp } from './api';
import { apiPost } from './api';
import AnswerPhoto from '@/app/shared/AnswerPhoto';
import TutorPanel from '@/app/shared/TutorPanel';

const VERDICT_STYLE: Record<QuestionAssessment['verdict'], { label: string; tone: string }> = {
  correct: { label: '正确', tone: 'tag green' },
  partial: { label: '部分正确', tone: 'tag orange' },
  wrong: { label: '错误', tone: 'tag red' },
};

const LEVEL_TONE: Record<string, string> = {
  巩固: 'tag green',
  提高: 'tag blue',
  拓展: 'tag purple',
};

/** 订正练习：提示逐条展开，学生自己控制看几条。 */
function PracticeCard({ practice }: { practice: Practice }) {
  const [openHints, setOpenHints] = useState<number[]>([]);
  const hints = practice.hints ?? [];
  const expected = practice.expected ?? [];

  function toggle(index: number) {
    setOpenHints((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index],
    );
  }

  return (
    <section className="stu-section">
      <h3>订正练习</h3>
      <div className="stu-practice">
        <p className="stu-practice-prompt">{practice.prompt}</p>

        {hints.length > 0 ? (
          <div className="stack" style={{ gap: 8 }}>
            {hints.map((hint, index) => {
              const open = openHints.includes(index);
              return (
                <div className="stu-hint" key={`hint-${index}`}>
                  <button type="button" onClick={() => toggle(index)} aria-expanded={open}>
                    {open ? '▾' : '▸'} 提示 {index + 1}
                  </button>
                  {open ? <p>{hint}</p> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {expected.length > 0 ? (
          <div className="stu-expected">
            <span className="eyebrow">参考要点</span>
            {expected.map((item, index) => (
              <span key={`expected-${index}`}>· {item}</span>
            ))}
          </div>
        ) : null}

        {practice.explain ? <p className="small muted">{practice.explain}</p> : null}
      </div>
    </section>
  );
}

type Props = {
  assignment: Assignment;
  submission: Submission;
  /** 刷新失败时由外层传入的接口错误文案。 */
  pageError?: string | null;
  onRefresh: () => Promise<void>;
  onClose: () => void;
};

export default function GradeView({
  assignment,
  submission,
  pageError,
  onRefresh,
  onClose,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [retryError, setRetryError] = useState('');

  async function retry() {
    setRegrading(true); setRetryError('');
    try { await apiPost('/api/submission', { action: 'regrade', submissionId: submission.id }); await onRefresh(); }
    catch (e) { setRetryError(e instanceof Error ? e.message : '批改失败'); }
    finally { setRegrading(false); }
  }

  const grade: Grade | null = submission.aiPayload;
  const released = isReleased(submission);
  const shownScore = effectiveScore(submission);
  // 防御式兜底：批改载荷来自服务端 JSON，缺字段时不要让整页崩掉。
  const questions: QuestionAssessment[] = grade?.questions ?? [];
  const extensions: Extension[] = grade?.extensions ?? [];
  const files = submission.files ?? [];

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="modal-mask stu-modal-mask">
      <div className="modal stu-modal" role="dialog" aria-modal="true" aria-label="批改结果">
        <div className="modal-head">
          <div>
            <h2>批改结果</h2>
            <p>
              {assignment.title} · 满分 {assignment.maxScore} 分 · 提交于{' '}
              {formatStamp(submission.submittedAt)}
            </p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="stack">
          {/* 当前应显示的分：定稿分 or 批改建议分 */}
          <section className="panel stu-score-panel">
            <p className="eyebrow">{released ? '教师定稿成绩' : '批改建议分'}</p>
            <div className="stu-score">
              <strong>{shownScore ?? '—'}</strong>
              <em>/ {assignment.maxScore}</em>
              <span className={released ? 'tag green' : 'tag orange'}>
                {released ? '已定稿' : '尚未经教师确认'}
              </span>
            </div>
            {released ? (
              <>
                <p className="small muted">定稿时间：{formatStamp(submission.reviewedAt)}</p>
                {submission.finalFeedback ? (
                  <div className="stu-quote">
                    <p className="eyebrow">教师评语</p>
                    <p>{submission.finalFeedback}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="small muted">
                教师还没有审核定稿，上面的分数只是系统给出的批改建议，最终成绩以教师定稿为准。
              </p>
            )}
          </section>

          {/* 占位批改必须显著提示，不能让学生当作真实 AI 判断 */}
          {grade && grade.placeholder ? (
            <div className="notice stu-placeholder">
              <strong>占位批改，不代表对学生作答的判断</strong>
              当前批改来源为「{grade.source}」，系统尚未接入视觉模型。下面的分数、逐行定位与订正建议只用于演示流程，
              不能当作真实 AI 批改结论；是否得分请以教师定稿为准。
            </div>
          ) : null}

          {!grade ? (
            <div className="empty">
              <strong>还没有批改明细</strong>
              {submission.status === 'pending'
                ? '照片已安全保存，当前尚未完成 AI 批改。可点击重新批改，或等待教师手动审核。'
                : released ? '本份作业由教师手动评分，未生成 AI 批改明细。' : '这份提交暂时没有可展示的批改明细，请稍后刷新。'}
            </div>
          ) : (
            <>
              <div className="grid cols-3">
                <div className="stat">
                  <span>批改建议分</span>
                  <strong>
                    {grade.score}
                    <em>/ {grade.maxScore}</em>
                  </strong>
                  <p>等级：{grade.category}</p>
                </div>
                <div className="stat">
                  <span>题目数</span>
                  <strong>
                    {questions.length}
                    <em>题</em>
                  </strong>
                  <p>生成于 {formatStamp(grade.generatedAt)}</p>
                </div>
                <div className="stat">
                  <span>教师定稿分</span>
                  <strong>
                    {submission.finalScore ?? '—'}
                    {submission.finalScore == null ? '' : <em>/ {assignment.maxScore}</em>}
                  </strong>
                  <p>{released ? '已定稿' : '尚未定稿'}</p>
                </div>
              </div>

              <p className="small muted">{grade.summary}</p>

              <section className="stu-section">
                <h3>逐题得分与逐行定位</h3>
                {questions.map((question, questionIndex) => {
                  const lines = question.lines ?? [];
                  return (
                    <article className="stu-question" key={`${question.number}-${questionIndex}`}>
                      <div className="stu-question-head">
                        <strong>第 {question.number} 题</strong>
                        <span className={VERDICT_STYLE[question.verdict].tone}>
                          {VERDICT_STYLE[question.verdict].label}
                        </span>
                        <span className="tag neutral">
                          {question.score} / {question.maxScore} 分
                        </span>
                      </div>

                      {question.summary ? <p className="small muted">{question.summary}</p> : null}

                      {lines.length === 0 ? (
                        <p className="small muted">
                          {question.verdict === 'correct'
                            ? '本题未发现错误行。'
                            : '本题暂未定位到具体行，请对照原图核对。'}
                        </p>
                      ) : (
                        <div className="stu-lines">
                          {lines.map((line, lineIndex) => (
                            <div className="stu-line" key={`line-${questionIndex}-${lineIndex}`}>
                              <div className="stu-line-head">
                                <span>第 {line.page ?? 1} 页 · 第 {line.line} 行</span>
                                {line.isFirstError ? (
                                  <span className="tag red">首次出错</span>
                                ) : null}
                                <span className="tag neutral">扣 {line.deduction} 分</span>
                              </div>
                              <p className="stu-line-origin">
                                {line.text
                                  ? `原文：${line.text}`
                                  : '未能识别该行原文，请对照原图查看。'}
                              </p>
                              {line.issue ? (
                                <p className="stu-line-issue">问题：{line.issue}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              {grade.practice ? <PracticeCard practice={grade.practice} /> : null}
              {!grade.placeholder ? <TutorPanel submissionId={submission.id} /> : null}

              {extensions.length > 0 ? (
                <section className="stu-section">
                  <h3>拓展题</h3>
                  {extensions.map((extension, index) => (
                    <div className="stu-extension" key={`extension-${index}`}>
                      <div className="stu-question-head">
                        <span className={LEVEL_TONE[extension.level] ?? 'tag neutral'}>
                          {extension.level}
                        </span>
                      </div>
                      <p className="stu-extension-prompt">{extension.prompt}</p>
                      <p className="stu-extension-goal">目标：{extension.goal}</p>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}

          {files.length > 0 ? (
            <details className="stu-photos" open>
              <summary>原图对照 · {files.length} 页</summary>
              <div className="answer-photo-grid">
                {files.map((fileId, index) => (
                  <AnswerPhoto key={fileId} src={`/api/files?id=${encodeURIComponent(fileId)}`} page={index + 1} grade={grade} alt={`已提交照片 ${index + 1}`} />
                ))}
              </div>
            </details>
          ) : null}

          {pageError ? <p className="error-text">{pageError}</p> : null}
          {retryError ? <p className="error-text" role="alert">{retryError}</p> : null}
          {grade?.needsReview ? <p className="notice">部分字迹、定位或评分存在不确定性，请对照原图并等待教师确认。</p> : null}
        </div>

        <div className="modal-foot">
          {!released ? <button type="button" className="secondary" onClick={() => { void retry(); }} disabled={regrading}>{regrading ? '正在批改…' : '重新 AI 批改'}</button> : null}
          <button
            className="secondary"
            type="button"
            onClick={() => {
              void refresh();
            }}
            disabled={refreshing}
          >
            {refreshing ? '刷新中…' : '刷新结果'}
          </button>
          <button className="primary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
