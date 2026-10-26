import { ApiError } from '@/app/api/shared';
import {aiConfig} from './config';

export async function requestStructured(input: { name: string; schema: object; instructions: string; content: object[] }): Promise<unknown> {
  const config=aiConfig();
  if (!config.configured) throw new ApiError('AI 服务尚未配置，请由教师审核，或配置模型后重试。', 503);
  if(!config.images&&input.content.some(part=>(part as {type?:string}).type==='input_image'))throw new ApiError('当前模型不支持作业照片，请配置 deepseek-flash 或使用支持图片的模型。',503);
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: config.model, ...(config.provider==='deepseek'?{reasoning:{effort:'high'}}:{store:false}), max_output_tokens: config.provider==='deepseek'?16000:8000, instructions: input.instructions,
        input: [{ role: 'user', content: input.content }],
        text: { format: { type: 'json_schema', name: input.name, strict: true, schema: input.schema } },
      }),
    });
  } catch { throw new ApiError('AI 服务连接失败或超时，请稍后重试。', 503); }
  if (!response.ok) {
    console.error('AI request failed', config.provider, response.status, response.headers.get('x-request-id'));
    const message=response.status===429?'AI 服务繁忙，请稍后重试。':response.status===402?'AI 账户余额不足，请教师充值后重试。':response.status===401?'AI 密钥无效或已失效，请教师更新配置。':'AI 服务暂不可用，请教师检查模型配置。';
    throw new ApiError(message,503);
  }
  const data = await response.json() as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (data.status !== 'completed') throw new ApiError('AI 未完成批改，请重试或交由教师审核。', 503);
  const text = (data.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === 'output_text').map((part) => part.text ?? '').join('');
  try { return JSON.parse(text); } catch { throw new ApiError('AI 返回格式无效，本次结果未记入成绩。', 503); }
}
