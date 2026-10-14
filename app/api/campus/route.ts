import {env} from 'cloudflare:workers';
import {AppError,failure,json,mustUser,rate,readJSON,sameOrigin} from '@/lib/campus';
import {action,snapshot,submissionHistory} from '@/lib/campus-service';
import {gradeCampusSubmission} from '@/lib/campus-ai';
export async function GET(req:Request){try{
 if(!env.DB)throw new AppError('数据库未配置',503);const u=await mustUser(env.DB,req);const sid=new URL(req.url).searchParams.get('history');
 return json(sid?{history:await submissionHistory(env.DB,u,sid)}:{...await snapshot(env.DB,u),aiConfigured:Boolean(env.OPENAI_API_KEY&&env.OPENAI_MODEL),localMode:env.LOCAL_DEMO==='true'});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 sameOrigin(req);if(!env.DB)throw new AppError('数据库未配置',503);const u=await mustUser(env.DB,req);await rate(env.DB,'actions:'+u.id,100,60000);const body=await readJSON(req);const result=await action(env.DB,u,body);
 if(body.action==='submit'&&env.OPENAI_API_KEY&&env.OPENAI_MODEL){
  try{await gradeCampusSubmission(env.DB,u,String(body.assignmentId)+':'+u.id)}catch{return json({...result,warning:'作业已保存，AI暂未完成，可稍后重试或由教师审核。'})}
 }
 return json(result);
}catch(e){return failure(e)}}
