// 教师端接口调用工具。
// 契约规定错误响应统一为 { error: "中文提示" }，这里把它转成异常消息，界面直接显示即可。

/** 从响应体里取服务端返回的 error 文案。 */
function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** GET 接口。失败时抛出带服务端 error 文案的异常。 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const body = await readJson(response);
  if (!response.ok) throw new Error(messageOf(body, `请求失败（${response.status}）`));
  return body as T;
}

/** POST 接口（JSON 请求体）。 */
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(messageOf(body, `请求失败（${response.status}）`));
  return body as T;
}

/** 从 Content-Disposition 里取文件名。 */
function filenameOf(disposition: string, fallback: string): string {
  const matched = /filename="?([^";]+)"?/.exec(disposition);
  return matched?.[1]?.trim() || fallback;
}

/** 导出 CSV：接口返回附件流，这里转成浏览器下载。 */
export async function downloadCsv(path: string, payload: unknown, fallbackName: string): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(messageOf(body, `导出失败（${response.status}）`));
  }

  const blob = await response.blob();
  const name = filenameOf(response.headers.get('content-disposition') ?? '', fallbackName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 立刻 revoke 有可能打断下载，留一点时间。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 把任意异常转成可展示的中文文案。 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试';
}
