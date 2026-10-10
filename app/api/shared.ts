// 接口层公共工具：统一的 JSON 响应、来源校验、请求体解析与错误封装。
// 所有接口都从这里取身份和写操作校验，避免每个路由各写一遍。
import { getCurrentUser, getIdentity } from '@/app/chatgpt-auth';
import type { Role, User } from '@/app/domain';

export type ApiUser = User;

/**
 * 带 HTTP 状态的业务错误。
 * 不要用中文消息做字符串匹配来判断状态码：那样消息一改状态码就错，
 * 而且「找不到」和「无权限」会被混为一谈。
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function badRequest(message: string): ApiError {
  return new ApiError(message, 400);
}

export function forbidden(message: string): ApiError {
  return new ApiError(message, 403);
}

export function notFound(message: string): ApiError {
  return new ApiError(message, 404);
}


export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function fail(error: string, status = 400): Response {
  return json({ error }, status);
}

/** 阻止跨站写入。同源以外的请求一律拒绝。 */
export function checkOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('请求来源无效', 403);
  return null;
}

export type AuthResult<T> = { user: T; response?: never } | { user?: never; response: Response };

/** 要求已登录。未登录返回 401，调用方直接 return response。 */
export async function withUser(): Promise<AuthResult<ApiUser>> {
  const identity = await getIdentity();
  if (!identity) return { response: fail('请先登录', 401) };
  const user = await getCurrentUser();
  if (!user) return { response: fail('请先登录', 401) };
  return { user };
}

/** 要求指定角色。角色不匹配返回 403。 */
export async function withRole(role: Role): Promise<AuthResult<ApiUser>> {
  const result = await withUser();
  if (result.response) return result;
  if (result.user.role !== role) {
    return { response: fail(role === 'teacher' ? '需要教师权限' : '需要学生权限', 403) };
  }
  return { user: result.user };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 200_000) throw badRequest('内容过长');
  const text = await request.text();
  if (text.length > 200_000) throw badRequest('内容过长');
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw badRequest('请求内容格式无效'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('请求内容格式无效');
  return body as Record<string, unknown>;
}

/** 把抛出的异常转成响应，避免把堆栈泄露给前端。 */
export function handleError(error: unknown): Response {
  if (error instanceof ApiError) return fail(error.message, error.status);
  if (error instanceof Error) {
    // 业务校验失败（例如「截止时间无效」）走 400；意外错误记日志并返回 500。
    console.error(error);
    return fail('操作暂时失败，请稍后重试。', 500);
  }
  console.error(error);
  return fail('操作失败，请稍后重试', 500);
}
