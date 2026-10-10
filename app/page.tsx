import { redirect } from 'next/navigation';
import { getExistingUser, roleHome } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

/** 入口：按角色分流到教师端或学生端；未登录进入说明页。 */
export default async function Home() {
  const user = await getExistingUser();
  redirect(roleHome(user?.role ?? null));
}
