import type { Metadata } from 'next';
import { StatsWorkspace } from '../_components/StatsWorkspace';
import '../teacher.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '成绩统计 · 数研 MathFlow',
};

type TeacherStatsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 取第一个查询参数值，兼容 ?id=a&id=b 的数组形式。 */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** 成绩统计页：/teacher/stats?id=<courseId> */
export default async function TeacherStatsPage({ searchParams }: TeacherStatsPageProps) {
  const params = await searchParams;
  return <StatsWorkspace courseId={firstValue(params.id)} />;
}
