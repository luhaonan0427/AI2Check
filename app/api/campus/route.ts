import {env} from 'cloudflare:workers';
import {AppError,failure,json,mustUser,rate,readJSON,sameOrigin} from '@/lib/campus';
import {action,snapshot,submissionHistory} from '@/lib/campus-service';
export async function GET(req:Request){try{if(!env.DB)throw new AppError('数据库未配置',503);const u=await mustUser(env.DB,req);const sid=new URL(req.url).searchParams.get('history');return json(sid?{history:await submissionHistory(env.DB,u,sid)}:await snapshot(env.DB,u))}catch(e){return failure(e)}}
export async function POST(req:Request){try{sameOrigin(req);if(!env.DB)throw new AppError('数据库未配置',503);const u=await mustUser(env.DB,req);await rate(env.DB,'actions:'+u.id,100,60000);return json(await action(env.DB,u,await readJSON(req)))}catch(e){return failure(e)}}
