import {env} from 'cloudflare:workers';
import {ApiError} from '@/app/api/shared';

export function aiConfig(){
 const provider=env.AI_PROVIDER||(env.DEEPSEEK_API_KEY?'deepseek':'openai');
 if(provider!=='openai'&&provider!=='deepseek')throw new ApiError('AI 服务配置无效，请教师检查服务商设置。',503);
 const key=provider==='deepseek'?env.DEEPSEEK_API_KEY:env.OPENAI_API_KEY;
 const model=provider==='deepseek'?(env.DEEPSEEK_MODEL||'deepseek-flash'):env.OPENAI_MODEL;
 return {provider,key,model,configured:Boolean(key&&model),
  endpoint:provider==='deepseek'?'https://api.deepseek.com/responses':'https://api.openai.com/v1/responses',
  images:provider==='openai'||model==='deepseek-flash'};
}
