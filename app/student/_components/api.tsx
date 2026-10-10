'use client';

// 学生端调用后端接口的统一入口。
// 后端所有错误都是 { error: "中文提示" } 形状（见 docs/接口契约.md），
// 这里统一把 error 取出来，界面直接显示，不再自己编文案。

import type { Assignment, Course, Submission, User } from '@/app/domain';

export type MeResponse = { user: User; courses: Course[] };

export type CourseResponse = {
  course: Course;
  role: 'teacher' | 'student';
  assignments: Assignment[];
  submissions: Submission[];
};

export type SubmitResponse = { submission: Submission; placeholder: boolean };

/** 带上 HTTP 状态码的错误，便于界面区分未登录（401）等情况。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value) return value;
  }
  return `请求失败（HTTP ${status}）`;
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试', 0);
  }
  const payload = await readPayload(response);
  if (!response.ok) throw new ApiError(errorMessage(payload, response.status), response.status);
  return payload as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return apiRequest<T>(url);
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 上传一张照片，返回后端分配的图片 id（交给 POST /api/submission 用）。 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const data = await apiRequest<{ id?: unknown }>('/api/files', { method: 'POST', body: form });
  if (!data || typeof data.id !== 'string' || !data.id) {
    throw new ApiError('图片上传失败，请重新选择后再试', 500);
  }
  return data.id;
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '操作失败，请重试';
}

export function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

// ---------------------------------------------------------------- 上传前的本地校验

export const MAX_FILES = 5;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSION = /\.(jpe?g|png|webp)$/i;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** 校验类型与单张大小；返回 null 表示通过。错误文案直接给用户看。 */
export function validateImage(file: File): string | null {
  if (file.size === 0) return `${file.name} 是空文件，请重新选择`;
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} 有 ${formatBytes(file.size)}，超过单张 8 MB 的限制`;
  }
  const typeOk = ALLOWED_TYPES.includes(file.type);
  // 部分手机相机不给 MIME，退回到扩展名判断；文件头校验仍由服务端把关。
  const fallbackOk = file.type === '' && ALLOWED_EXTENSION.test(file.name);
  if (!typeOk && !fallbackOk) return `${file.name} 格式不支持，仅支持 JPG / PNG / WebP`;
  return null;
}

// ---------------------------------------------------------------- 展示用的小工具

/** 作业截止时间是 `YYYY-MM-DDTHH:mm` 文本，直接切分显示，避免时区偏移。 */
export function formatDueLabel(due: string): string {
  if (!due) return '未设置';
  const [date, time] = due.split('T');
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export function isPastDue(due: string): boolean {
  const time = new Date(due).getTime();
  return Number.isFinite(time) && time < Date.now();
}

export function formatStamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
