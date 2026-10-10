import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import StudentHome from './_components/student-home';
import './student.css';

export const dynamic = 'force-dynamic';

/** 学生首页：我的课程 + 用课程码加入课程。 */
export default function StudentPage() {
  return (
    <StudentHome
      signInHref={chatGPTSignInPath('/student')}
      signOutHref={chatGPTSignOutPath('/welcome')}
    />
  );
}
