import type { Metadata } from 'next';
import { CourseWorkspace } from '../_components/CourseWorkspace';
import '../teacher.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '课程管理 · 数研 MathFlow',
};

type TeacherCoursePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 取第一个查询参数值，兼容 ?id=a&id=b 的数组形式。 */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** 课程管理页：/teacher/course?id=<courseId> */
export default async function TeacherCoursePage({ searchParams }: TeacherCoursePageProps) {
  const params = await searchParams;
  return <CourseWorkspace courseId={firstValue(params.id)} />;
}
