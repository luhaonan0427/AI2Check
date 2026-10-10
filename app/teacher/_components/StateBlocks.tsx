// 加载 / 空 / 错误三种状态的统一呈现，保证每个页面都有完整状态处理。
import type { ReactNode } from 'react';

export function LoadingBlock({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-text" role="alert">
      {message}
      {onRetry ? (
        <>
          {' '}
          <button type="button" className="text-button" onClick={onRetry}>
            重试
          </button>
        </>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint ? <span className="small muted">{hint}</span> : null}
    </div>
  );
}
