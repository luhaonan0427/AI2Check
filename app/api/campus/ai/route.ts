import {env} from 'cloudflare:workers';
import {gradeCampusSubmission} from '@/lib/campus-ai';
import {AppError,failure,json,mustUser,rate,readJSON,sameOrigin} from '@/lib/campus';
import {ApiError} from '@/app/api/shared';
export async function POST(req:Request){try{
 sameOrigin(req);if(!env.DB)throw new AppError('数据库未配置',503);
 const u=await mustUser(env.DB,req);await rate(env.DB,'ai:'+u.id,10,60000);
 const body=await readJSON(req);const grade=await gradeCampusSubmission(env.DB,u,String(body.submissionId||''));return json({grade});
}catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);return failure(e)}}
