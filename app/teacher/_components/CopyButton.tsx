'use client';

import { useEffect, useRef, useState } from 'react';

/** 复制文本：优先用剪贴板 API，环境不支持时退回选区方案。 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒绝等情况，继续尝试退回方案。
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 一键复制课程码，并在按钮上给出即时反馈。 */
export function CopyButton({ value, label = '复制课程码' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    const ok = await writeClipboard(value);
    setState(ok ? 'done' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2400);
  }

  return (
    <button type="button" className="secondary" onClick={() => void handleCopy()} aria-live="polite">
      {state === 'done' ? '已复制' : state === 'failed' ? '复制失败，请手动复制' : label}
    </button>
  );
}
