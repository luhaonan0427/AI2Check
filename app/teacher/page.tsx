import type { Metadata } from 'next';
import { Workbench } from './_components/Workbench';
import './teacher.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '教师工作台 · 数研 MathFlow',
};

/** 教师工作台：服务端渲染外壳，数据由客户端组件调用 /api/me 获取。 */
export default function TeacherHomePage() {
  return <Workbench />;
}
