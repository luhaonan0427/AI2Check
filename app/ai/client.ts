import { env } from 'cloudflare:workers';
import { ApiError } from '@/app/api/shared';

export async function requestStructured(input: { name: string; schema: object; instructions: string; content: object[] }): Promise<unknown> {
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw new ApiError('AI 服务尚未配置，请由教师审核，或配置模型后重试。', 503);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: env.OPENAI_MODEL, store: false, max_output_tokens: 8000, instructions: input.instructions,
        input: [{ role: 'user', content: input.content }],
        text: { format: { type: 'json_schema', name: input.name, strict: true, schema: input.schema } },
      }),
    });
  } catch { throw new ApiError('AI 服务连接失败或超时，请稍后重试。', 503); }
  if (!response.ok) {
    console.error('AI request failed', response.status, response.headers.get('x-request-id'));
    throw new ApiError(response.status === 429 ? 'AI 服务繁忙，请稍后重试。' : 'AI 服务暂不可用，请教师检查模型配置。', 503);
  }
  const data = await response.json() as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (data.status !== 'completed') throw new ApiError('AI 未完成批改，请重试或交由教师审核。', 503);
  const text = (data.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === 'output_text').map((part) => part.text ?? '').join('');
  try { return JSON.parse(text); } catch { throw new ApiError('AI 返回格式无效，本次结果未记入成绩。', 503); }
}
