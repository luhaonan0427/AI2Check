import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
export function middleware(){
 if(env.LOCAL_DEMO!=='true')return NextResponse.json({error:'旧版演示入口已停用，请使用学生端或教师端。'},{status:410});
 return NextResponse.next();
}
export const config={matcher:['/api/assignments','/api/course','/api/files','/api/me','/api/stats','/api/submission','/api/tutor','/api/workspace','/demo/:path*']};
