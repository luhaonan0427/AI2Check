import {env} from 'cloudflare:workers';
import {AppError,failure,json,mustUser,rate,readJSON,sameOrigin} from '@/lib/campus';
import {generateSolution} from '@/lib/campus-solution';
export async function POST(req:Request){try{sameOrigin(req);if(!env.DB)throw new AppError('数据库未配置',503);const u=await mustUser(env.DB,req);await rate(env.DB,'solution:'+u.id,10,60000);const b=await readJSON(req);if(typeof b.assignmentId!=='string')throw new AppError('请选择作业');await generateSolution(env.DB,u,b.assignmentId);return json({ok:true})}catch(e){return failure(e)}}
