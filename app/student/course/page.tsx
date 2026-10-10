import { Suspense } from 'react';
import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import CourseWork from '../_components/course-work';
import '../student.css';

export const dynamic = 'force-dynamic';

/** 我的作业：作业列表、拍照提交、查看批改结果（课程 id 来自 ?id=）。 */
export default function StudentCoursePage() {
  return (
    <Suspense
      fallback={
        <main className="entry">
          <div className="entry-card">
            <p className="muted">正在加载课程作业…</p>
          </div>
        </main>
      }
    >
      <CourseWork
        signInHref={chatGPTSignInPath('/student')}
        signOutHref={chatGPTSignOutPath('/welcome')}
      />
    </Suspense>
  );
}
