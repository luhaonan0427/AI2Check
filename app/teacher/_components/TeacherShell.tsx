// 教师端统一外壳：侧边导航 + 顶栏 + 内容区。
// 只做展示，不取数据，服务端页面与客户端组件都可以使用。
import Link from 'next/link';
import type { ReactNode } from 'react';

export type TeacherNavKey = 'workbench' | 'course' | 'stats';

const NAV: { key: TeacherNavKey; href: string; label: string }[] = [
  { key: 'workbench', href: '/teacher', label: '我的课程' },
  { key: 'course', href: '/teacher/course', label: '课程管理' },
  { key: 'stats', href: '/teacher/stats', label: '成绩统计' },
];

export function TeacherShell({
  active,
  title,
  subtitle,
  userName,
  children,
}: {
  active: TeacherNavKey;
  title: string;
  subtitle?: string;
  userName?: string;
  children: ReactNode;
}) {
  return (
    <div className="shell teacher-theme">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">∑</span>
          <div>
            数研 <small>MathFlow</small>
          </div>
        </div>
        <nav aria-label="教师端导航">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href} aria-current={item.key === active ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="workspace-label"><span className="eyebrow">TEACHER WORKSPACE</span><strong>教学与审核</strong><p>从作业过程，看见学生的理解。</p></div>
        <div className="sidebar-foot">
          <span>{userName ? `${userName} · 教师` : '教师账号'}</span>
          <a href="/signout-with-chatgpt?return_to=%2Fwelcome">退出登录</a>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          {subtitle ? <span className="small muted">{subtitle}</span> : null}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
