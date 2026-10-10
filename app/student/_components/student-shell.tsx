'use client';

// 学生端外壳：侧栏 + 顶栏 + 内容区。
// 排版复用 app.css 的 .shell/.sidebar/.main/.topbar/.content，窄屏样式在 student.css 里收紧。

import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  /** 顶栏标题，例如课程名。 */
  title: string;
  /** 顶栏小字，默认「学生端」。 */
  subtitle?: string;
  /** 当前选中的导航项。 */
  active: 'courses' | 'course';
  /** 进入具体课程页时给出课程 id，侧栏会出现「当前课程」。 */
  courseId?: string | null;
  /** 登录学生姓名，用于右上角显示。 */
  identity?: string | null;
  /** 顶栏右侧的额外操作（例如刷新）。 */
  actions?: ReactNode;
  signOutHref: string;
  children: ReactNode;
};

export default function StudentShell({
  title,
  subtitle,
  active,
  courseId,
  identity,
  actions,
  signOutHref,
  children,
}: Props) {
  return (
    <div className="shell student-theme">
      <aside className="sidebar stu-sidebar">
        <div className="brand">
          <span className="brand-icon">∑</span>
          <div>
            数研 <small>MathFlow</small>
          </div>
        </div>
        <nav>
          <Link href="/student" aria-current={active === 'courses' ? 'page' : undefined}>
            我的课程
          </Link>
          {courseId ? (
            <Link
              href={`/student/course?id=${encodeURIComponent(courseId)}`}
              aria-current={active === 'course' ? 'page' : undefined}
            >
              当前课程
            </Link>
          ) : null}
        </nav>
        <div className="workspace-label"><span className="eyebrow">STUDENT WORKSPACE</span><strong>学习与订正</strong><p>每一步尝试，都离理解更近。</p></div>
        <div className="sidebar-foot">
          <span className="stu-role">学生端 · 拍照提交作业</span>
          <a href={signOutHref} target="_top">
            退出登录
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar stu-topbar">
          <div className="stu-topbar-title">
            <p className="eyebrow">{subtitle ?? '学生端'}</p>
            <h1>{title}</h1>
          </div>
          <div className="actions">
            {actions}
            {identity ? (
              <span className="stu-user">
                <span className="avatar">{identity.slice(0, 1)}</span>
                <span className="small">{identity}</span>
              </span>
            ) : null}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
