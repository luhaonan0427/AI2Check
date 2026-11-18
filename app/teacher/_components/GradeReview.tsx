'use client';

// 批改审核面板：左侧对照学生原图，右侧呈现批改结构（逐题得分 / 逐行错误定位 / 订正练习 / 拓展题），
// 底部是改分与反馈表单，提交后调用 POST /api/submission action=review 定稿。
import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  Assignment,
  Extension,
  Grade,
  Practice,
  QuestionAssessment,
  Submission,
} from '@/app/domain';
import { classify } from '@/app/domain';
import { apiPost, errorMessage } from './api';
import { EmptyBlock } from './StateBlocks';
import { PlaceholderNotice } from './PlaceholderNotice';
import AnswerPhoto from '@/app/shared/AnswerPhoto';
import TutorPanel from '@/app/shared/TutorPanel';
import {
  categoryTagClass,
  formatDateTime,
  scoreText,
  statusLabel,
  verdictLabel,
  verdictTagClass,
} from './format';

/** 教师读学生原图必须带上 owner，service 端会校验授课关系。 */
function imageUrl(fileId: string, studentId: string): string {
  return `/api/files?id=${encodeURIComponent(fileId)}&owner=${encodeURIComponent(studentId)}`;
}

function initialScoreText(submission: Submission): string {
  if (submission.status === 'approved' && submission.finalScore != null) return String(submission.finalScore);
  if (submission.aiScore != null) return String(submission.aiScore);
  return '';
}

export function GradeReview({
  submission,
  assignment,
  onCancel,
  onSaved,
}: {
  submission: Submission;
  assignment: Assignment;
  onCancel: () => void;
  onSaved: (updated: Submission) => void;
}) {
  const grade: Grade | null = submission.aiPayload;
  const maxScore = grade?.maxScore ?? assignment.maxScore;

  const [score, setScore] = useState(() => initialScoreText(submission));
  const [feedback, setFeedback] = useState(submission.finalFeedback ?? (grade && !grade.placeholder ? grade.summary : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsedScore = Number(score);
  const scoreValid =
    score.trim() !== '' && Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= maxScore;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!scoreValid) {
      setError(`分数需为 0 到 ${maxScore} 之间的数字`);
      return;
    }
    if (!feedback.trim()) {
      setError('请填写反馈后再定稿（学生端会看到这段反馈）');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await apiPost<{ submission: Submission }>('/api/submission', {
        action: 'review',
        submissionId: submission.id,
        score: parsedScore,
        feedback: feedback.trim(),
      });
      onSaved(result.submission);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-mask" role="dialog" aria-modal="true" aria-label="批改审核">
      <div className="modal wide">
        <div className="modal-head">
          <div>
            <h2>批改审核 · {submission.studentName}</h2>
            <p>
              {assignment.title}
              {submission.studentNumber ? ` ｜ 学号 ${submission.studentNumber}` : ''}
              {` ｜ 提交于 ${formatDateTime(submission.submittedAt)}`}
              {` ｜ 当前状态：${statusLabel(submission.status)}`}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </div>

        {grade?.placeholder ? <PlaceholderNotice /> : null}
        {grade?.needsReview ? <p className="notice">AI 对部分字迹或评分存在不确定性，请重点核查原图。</p> : null}

        <div className="split review-split">
          <section>
            <h3 className="block-title">学生原图</h3>
            {submission.files.length > 0 ? (
              <div className="answer-images">
                {submission.files.map((fileId, index) => (
                  <AnswerPhoto key={fileId} src={imageUrl(fileId, submission.studentId)} page={index + 1} grade={grade} alt={`${submission.studentName} 作答原图第 ${index + 1} 页`} />
                ))}
              </div>
            ) : (
              <EmptyBlock title="没有可显示的原图" hint="这份提交没有附带照片。" />
            )}
          </section>

          <section className="stack">
            <div>
              <h3 className="block-title">批改结构</h3>
              {grade ? (
                <>
                  <div className="grade-summary">
                    <span>
                      建议分 <strong>{scoreText(grade.score)}</strong> / {scoreText(grade.maxScore)}
                    </span>
                    <span className={categoryTagClass(grade.category)}>{grade.category}</span>
                    <span className="small muted">识别与评分置信度 {Math.round(grade.confidence * 100)}%</span>
                    <span className="small muted">
                      来源 {grade.source} · {formatDateTime(grade.generatedAt)}
                    </span>
                  </div>
                  <p className="small muted">{grade.summary}</p>
                </>
              ) : (
                <EmptyBlock
                  title="暂无批改结构"
                  hint="这份提交还没有生成批改建议，可以直接在下方填写分数与反馈。"
                />
              )}
            </div>

            {grade ? (
              <>
                <div className="stack">
                  <h3 className="block-title">逐题得分与逐行错误定位</h3>
                  {grade.questions.map((question) => (
                    <QuestionCard key={question.number} question={question} />
                  ))}
                </div>
                <PracticeBlock practice={grade.practice} extensions={grade.extensions} />
              </>
            ) : null}
          </section>
        </div>

        {grade && !grade.placeholder ? <TutorPanel submissionId={submission.id} readOnly /> : null}
        <form className="stack review-form" onSubmit={handleSubmit}>
          <h3 className="block-title">审核定稿</h3>
          <div className="field">
            <label htmlFor="review-score">定稿分数</label>
            <div className="actions">
              <input
                id="review-score"
                type="number"
                min={0}
                max={maxScore}
                step={1}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                disabled={busy}
              />
              {grade ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setScore(String(grade.score))}
                  disabled={busy}
                >
                  采用建议分 {scoreText(grade.score)}
                </button>
              ) : null}
            </div>
            <span className="hint">
              满分 {maxScore} 分。
              {scoreValid ? `按此分数将归档为「${classify(parsedScore, maxScore)}」。` : '请填写 0 到满分之间的数字。'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="review-feedback">反馈（必填，学生可见）</label>
            <textarea
              id="review-feedback"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={busy}
              placeholder="写下需要学生注意的具体问题与改进建议。"
            />
          </div>

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal-foot">
            <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
              关闭
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '保存中…' : submission.status === 'approved' ? '更新定稿' : '保存并定稿'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 单题：得分 + 判定 + 逐行错误定位表。 */
function QuestionCard({ question }: { question: QuestionAssessment }) {
  const deduction = question.maxScore - question.score;
  return (
    <article className="question-card">
      <div className="question-head">
        <strong>第 {question.number} 题</strong>
        <span className="question-score">
          得分 <strong>{scoreText(question.score)}</strong> / {scoreText(question.maxScore)}
        </span>
        <span className={verdictTagClass(question.verdict)}>{verdictLabel(question.verdict)}</span>
      </div>
      <p className="small muted">{question.summary}</p>

      {question.lines.length > 0 ? (
        <div className="table-wrap line-wrap">
          <table className="data line-table">
            <thead>
              <tr>
                <th>行号</th>
                <th>学生原文</th>
                <th>问题描述</th>
                <th>扣分</th>
              </tr>
            </thead>
            <tbody>
              {question.lines.map((line, index) => (
                <tr key={`${line.line}-${index}`} className={line.isFirstError ? 'line-first' : undefined}>
                  <td className="line-no">
                    第 {line.page ?? 1} 页 · 第 {line.line} 行
                    {line.isFirstError ? <span className="tag red line-flag">首次出错</span> : null}
                  </td>
                  <td>
                    {line.text ? (
                      <code className="line-text">{line.text}</code>
                    ) : (
                      <span className="muted">未能识别该行原文</span>
                    )}
                  </td>
                  <td>{line.issue ?? <span className="muted">—</span>}</td>
                  <td className="right">{line.deduction > 0 ? `-${scoreText(line.deduction)}` : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">本题未标记错误行。</p>
      )}

      <p className="hint">本题共扣 {scoreText(deduction)} 分（同源错误只标第一处）。</p>
    </article>
  );
}

/** 订正练习 + 拓展题。 */
function PracticeBlock({
  practice,
  extensions,
}: {
  practice: Practice | null;
  extensions: Extension[];
}) {
  return (
    <div className="stack">
      <div>
        <h3 className="block-title">订正练习</h3>
        {practice ? (
          <div className="question-card">
            <p>{practice.prompt}</p>
            {practice.hints.length > 0 ? (
              <ul className="hint-list">
                {practice.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            ) : null}
            {practice.expected.length > 0 ? (
              <p className="small">
                <span className="muted">参考要点：</span>
                {practice.expected.join('；')}
              </p>
            ) : null}
            <p className="small muted">{practice.explain}</p>
          </div>
        ) : (
          <p className="hint">本次批改没有生成订正练习（各题判定为正确时不会生成）。</p>
        )}
      </div>

      <div>
        <h3 className="block-title">拓展题</h3>
        {extensions.length > 0 ? (
          <ul className="extension-list">
            {extensions.map((item, index) => (
              <li className="question-card" key={`${item.level}-${index}`}>
                <div className="question-head">
                  <span className="tag purple">{item.level}</span>
                  <span className="small muted">{item.goal}</span>
                </div>
                <p>{item.prompt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">暂无拓展题。</p>
        )}
      </div>
    </div>
  );
}
