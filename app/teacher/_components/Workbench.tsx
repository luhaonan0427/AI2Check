'use client';

// 教师工作台：我的课程列表、创建课程、展示并一键复制课程码。
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import type { Course } from '@/app/domain';
import { apiGet, apiPost, errorMessage } from './api';
import { CopyButton } from './CopyButton';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './StateBlocks';
import { TeacherShell } from './TeacherShell';
import { formatDateTime } from './format';
import type { MeResponse } from './types';

const EMPTY_FORM = { name: '', code: '', term: '' };

export function Workbench() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await apiGet<MeResponse>('/api/me');
      setData(response);
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load 的 setState 都发生在 await 之后；放进微任务，避免被判定为 effect 同步阶段写状态。
    void Promise.resolve().then(() => load());
  }, [load]);

  /** 手动刷新：由点击触发，这里显式进入加载态。 */
  async function handleRefresh() {
    setLoading(true);
    setError('');
    await load();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const name = form.name.trim();
    const code = form.code.trim();
    if (!name) {
      setFormError('请填写课程名称');
      return;
    }
    if (!code) {
      setFormError('请填写课程代码');
      return;
    }

    setCreating(true);
    setFormError('');
    setNotice('');
    try {
      const result = await apiPost<{ course: Course }>('/api/course', {
        op: 'create',
        name,
        code,
        term: form.term.trim() || null,
      });
      setData((current) =>
        current ? { ...current, courses: [result.course, ...current.courses] } : current,
      );
      setNotice(`课程已创建，课程码 ${result.course.joinCode} —— 请发给学生用于加入课程。`);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setCreating(false);
    }
  }

  const courses = data?.courses ?? [];

  return (
    <TeacherShell
      active="workbench"
      title="教师工作台"
      subtitle={data ? `${data.user.displayName} · 共 ${courses.length} 门课程` : undefined}
      userName={data?.user.displayName}
    >
      <section className="workspace-hero"><div><p className="eyebrow">TEACHING, WITH MORE CLARITY</p><h2>从一道题，看见一份理解。</h2><p>创建课程、发布作业，对照学生的每一步推导完成审核。</p></div><span className="hero-math" aria-hidden="true">∫ f(x) dx</span></section>
      <section className="panel">
        <div className="panel-head">
          <h2>创建课程</h2>
          <span className="small muted">创建后自动生成 6 位课程码</span>
        </div>
        <form className="stack" onSubmit={handleCreate}>
          <div className="field-row">
            <label className="field" htmlFor="course-name">
              课程名称
              <input
                id="course-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={60}
                placeholder="例如：数学分析 I"
                disabled={creating}
              />
            </label>
            <label className="field" htmlFor="course-code">
              课程代码
              <input
                id="course-code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                maxLength={30}
                placeholder="例如：MATH 101"
                disabled={creating}
              />
            </label>
            <label className="field" htmlFor="course-term">
              学期
              <input
                id="course-term"
                value={form.term}
                onChange={(event) => setForm({ ...form, term: event.target.value })}
                placeholder="例如：2026 秋"
                disabled={creating}
              />
            </label>
          </div>
          {formError ? (
            <p className="error-text" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="actions">
            <button type="submit" className="primary" disabled={creating}>
              {creating ? '创建中…' : '创建课程'}
            </button>
          </div>
        </form>
      </section>

      {notice ? (
        <p className="ok-text" role="status">
          {notice}
        </p>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>我的课程</h2>
          <button type="button" className="secondary" onClick={() => void handleRefresh()} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>

        {loading ? <LoadingBlock label="正在加载课程列表…" /> : null}

        {!loading && error ? <ErrorBlock message={`加载课程失败：${error}`} onRetry={() => void load()} /> : null}

        {!loading && !error && courses.length === 0 ? (
          <EmptyBlock title="还没有课程" hint="用上面的表单创建第一门课程，然后把课程码发给学生。" />
        ) : null}

        {!loading && !error && courses.length > 0 ? (
          <div className="grid cols-2">
            {courses.map((course) => (
              <article className="course-card" key={course.id}>
                <div className="course-card-head">
                  <div>
                    <h3 className="title">{course.name}</h3>
                    <p className="small muted">
                      {course.code}
                      {course.term ? ` · ${course.term}` : ''}
                    </p>
                  </div>
                  <span className="tag purple">教师</span>
                </div>

                <div className="copy-row">
                  <span className="course-code">{course.joinCode}</span>
                  <CopyButton value={course.joinCode} />
                </div>
                <p className="hint">学生凭这个课程码加入课程；创建于 {formatDateTime(course.createdAt)}。</p>

                <div className="actions">
                  <Link className="primary" href={`/teacher/course?id=${encodeURIComponent(course.id)}`}>
                    课程管理与批改审核
                  </Link>
                  <Link className="secondary" href={`/teacher/stats?id=${encodeURIComponent(course.id)}`}>
                    成绩统计
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </TeacherShell>
  );
}
