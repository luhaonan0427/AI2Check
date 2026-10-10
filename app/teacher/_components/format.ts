// 教师端展示用的格式化工具。只在客户端渲染时使用，避免服务端与浏览器时区不一致造成水合差异。
import type { Category, SubmissionStatus } from '@/app/domain';

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO 时间或 YYYY-MM-DDTHH:mm → 「YYYY-MM-DD HH:mm」。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 提交状态的中文标签。 */
export function statusLabel(status: SubmissionStatus): string {
  if (status === 'approved') return '已定稿';
  if (status === 'graded') return '待审核';
  return '待批改';
}

export function statusTagClass(status: SubmissionStatus): string {
  if (status === 'approved') return 'tag green';
  if (status === 'graded') return 'tag blue';
  return 'tag orange';
}

export function categoryTagClass(category: Category | null): string {
  if (category === '全对') return 'tag green';
  if (category === '部分正确') return 'tag orange';
  if (category === '全错') return 'tag red';
  return 'tag neutral';
}

export function verdictLabel(verdict: 'correct' | 'partial' | 'wrong'): string {
  if (verdict === 'correct') return '正确';
  if (verdict === 'partial') return '部分正确';
  return '错误';
}

export function verdictTagClass(verdict: 'correct' | 'partial' | 'wrong'): string {
  if (verdict === 'correct') return 'tag green';
  if (verdict === 'partial') return 'tag orange';
  return 'tag red';
}

/** 分数展示：整数不带小数点，空值显示破折号。 */
export function scoreText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 百分比（0-100 的整数），用于进度条宽度。 */
export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}
