import { listStudentCourses, listTeacherCourses } from '@/db/store';
import { json, withUser } from '../shared';

export const dynamic = 'force-dynamic';

/** 当前身份 + 我的课程（教师：我教的；学生：我加入的）。 */
export async function GET() {
  const result = await withUser();
  if (result.response) return result.response;
  const user = result.user;

  const courses =
    user.role === 'teacher'
      ? await listTeacherCourses(user.id)
      : await listStudentCourses(user.id);

  return json({ user, courses });
}
