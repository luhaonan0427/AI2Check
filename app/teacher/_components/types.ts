// 教师端接口响应的视图类型。
// 领域实体（Course / Assignment / Submission / Grade …）一律从 app/domain.ts 引入，这里只描述响应外壳。
import type { Assignment, Course, Submission, User } from '@/app/domain';
import type { StudentTotals } from '@/db/store';

/** GET /api/me */
export type MeResponse = {
  user: User;
  courses: Course[];
};

/** 课程里的学生（教师视角）。 */
export type StudentBrief = {
  studentId: string;
  displayName: string;
  studentNumber: string | null;
};

/** GET /api/course?id= 的教师视角响应。 */
export type CourseDetailResponse = {
  course: Course;
  role: 'teacher';
  assignments: Assignment[];
  submissions: Submission[];
  students: StudentBrief[];
};

/** GET /api/stats?courseId= */
export type StatsResponse = {
  course: Course;
  assignments: Assignment[];
  totals: StudentTotals[];
};
