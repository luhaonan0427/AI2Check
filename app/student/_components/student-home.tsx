'use client';

// 学生首页 /student：我的课程列表 + 用课程码加入课程（POST /api/course op=join）。

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Course } from '@/app/domain';
import { apiGet, apiPost, messageOf, statusOf, type MeResponse } from './api';
import StudentShell from './student-shell';

type Props = {
  signInHref: string;
  signOutHref: string;
};

export default function StudentHome({ signInHref, signOutHref }: Props) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const next = await apiGet<MeResponse>('/api/me');
      setMe(next);
      setError(null);
      setErrorStatus(null);
    } catch (err) {
      setError(messageOf(err));
      setErrorStatus(statusOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 用微任务错开 effect 同步阶段，避免在 effect 里同步 setState 触发级联渲染。
    void Promise.resolve().then(() => load());
  }, [load]);

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining) return;

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError('请输入课程码');
      return;
    }

    setJoining(true);
    setJoinError(null);
    setJoinNotice(null);
    try {
      const result = await apiPost<{ course: Course }>('/api/course', {
        op: 'join',
        joinCode: code,
        studentNumber: studentNumber.trim() || null,
      });
      setJoinCode('');
      setJoinNotice(`已加入课程「${result.course.name}」，可以在下面的列表里进入。`);
      // 加入成功后刷新列表（静默刷新，避免整页跳到加载态）。
      await load({ silent: true });
    } catch (err) {
      setJoinError(messageOf(err));
    } finally {
      setJoining(false);
    }
  }

  const courses = me?.courses ?? [];

  return (
    <StudentShell
      title="我的课程"
      subtitle="学生端 · 课程与作业"
      active="courses"
      identity={me?.user.displayName ?? null}
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
      <section className="workspace-hero"><div><p className="eyebrow">LEARN ONE STEP AT A TIME</p><h2>从写下答案，到理解每一步。</h2><p>进入课程查看作业，上传手写过程，再用订正和追问巩固理解。</p></div><span className="hero-math" aria-hidden="true">lim x → ∞</span></section>
      {error ? (
        <section className="panel">
          <p className="error-text">{error}</p>
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
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>我的课程</h2>
          <span className="tag neutral">{courses.length} 门</span>
        </div>

        {loading && !me ? (
          <div className="empty">正在加载我的课程…</div>
        ) : courses.length === 0 ? (
          <div className="empty">
            <strong>还没有加入任何课程</strong>
            向教师索取课程码，在下面的「加入课程」里输入即可。
          </div>
        ) : (
          courses.map((course) => (
            <Link
              className="row stu-course-row"
              href={`/student/course?id=${encodeURIComponent(course.id)}`}
              key={course.id}
            >
              <span className="icon-plate purple">课</span>
              <div className="row-body">
                <strong>{course.name}</strong>
                <p>
                  {course.code}
                  {course.term ? ` · ${course.term}` : ''}
                </p>
              </div>
              <span className="tag blue">进入作业</span>
            </Link>
          ))
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>加入课程</h2>
          <span className="hint">课程码由教师提供，不区分大小写</span>
        </div>
        <form
          className="stack"
          onSubmit={(event) => {
            void onJoin(event);
          }}
        >
          <div className="field-row">
            <label className="field">
              课程码
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="例如 A7K2QM"
                maxLength={10}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
            <label className="field">
              学号（选填）
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                placeholder="例如 2026010101"
                maxLength={30}
                autoComplete="off"
                inputMode="numeric"
              />
            </label>
          </div>
          <p className="hint">
            学号会显示给授课教师，便于核对成绩；加入后可以在「我的课程」里完成拍照提交。
          </p>
          {joinError ? <p className="error-text">{joinError}</p> : null}
          {joinNotice ? <p className="notice">{joinNotice}</p> : null}
          <div className="actions stu-actions">
            <button className="primary" type="submit" disabled={joining || !joinCode.trim()}>
              {joining ? '正在加入…' : '加入课程'}
            </button>
          </div>
        </form>
      </section>
    </StudentShell>
  );
}
