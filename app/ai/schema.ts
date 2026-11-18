import { z } from 'zod';
import { ApiError } from '@/app/api/shared';

const str = { type: 'string' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const nullableStr = { type: ['string', 'null'] };
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const gradeSchema = object({
  score: num, maxScore: num, confidence: num, needsReview: bool, summary: str,
  questions: array(object({ number: { type: 'integer' }, score: num, maxScore: num, verdict: { type: 'string', enum: ['correct', 'partial', 'wrong'] }, summary: str,
    lines: array(object({ page: { type: 'integer' }, line: { type: 'integer' }, box: { anyOf: [array(num), { type: 'null' }] }, text: nullableStr, isFirstError: bool, issue: nullableStr, deduction: num })) })),
  practice: { anyOf: [object({ prompt: str, hints: array(str), expected: array(str), explain: str }), { type: 'null' }] },
  extensions: array(object({ prompt: str, level: { type: 'string', enum: ['巩固', '提高', '拓展'] }, goal: str })),
});
const line = z.object({ page: z.number().int().positive(), line: z.number().int().positive(), box: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(), text: z.string().nullable(), isFirstError: z.boolean(), issue: z.string().nullable(), deduction: z.number().finite().nonnegative() });
const parsedGrade = z.object({ score: z.number().finite().nonnegative(), maxScore: z.number().finite().positive(), confidence: z.number().min(0).max(1), needsReview: z.boolean(), summary: z.string(),
  questions: z.array(z.object({ number: z.number().int().positive(), score: z.number().finite().nonnegative(), maxScore: z.number().finite().positive(), verdict: z.enum(['correct', 'partial', 'wrong']), summary: z.string(), lines: z.array(line) })).min(1),
  practice: z.object({ prompt: z.string(), hints: z.array(z.string()), expected: z.array(z.string()), explain: z.string() }).nullable(),
  extensions: z.array(z.object({ prompt: z.string(), level: z.enum(['巩固', '提高', '拓展']), goal: z.string() })),
});

export function validateGrade(raw: unknown, maxScore: number, pages: number) {
  const result = parsedGrade.safeParse(raw);
  const invalid = () => { throw new ApiError('AI 评分或定位未通过校验，请重试或由教师审核。', 503); };
  if (!result.success) return invalid();
  const grade = result.data;
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (!close(grade.maxScore, maxScore) || grade.score > maxScore || !close(grade.questions.reduce((n, q) => n + q.score, 0), grade.score) || !close(grade.questions.reduce((n, q) => n + q.maxScore, 0), maxScore)) return invalid();
  if (new Set(grade.questions.map((q) => q.number)).size !== grade.questions.length) return invalid();
  for (const q of grade.questions) {
    if (q.score > q.maxScore || q.verdict !== (q.score === q.maxScore ? 'correct' : q.score === 0 ? 'wrong' : 'partial')) return invalid();
    if (q.lines.length && !close(q.lines.reduce((n, l) => n + l.deduction, 0), q.maxScore - q.score)) return invalid();
    for (const l of q.lines) {
      if (l.page > pages || l.deduction > q.maxScore) return invalid();
      if (l.box && (l.box.some((n) => !Number.isFinite(n) || n < 0 || n > 1) || l.box[2] <= 0 || l.box[3] <= 0 || l.box[0] + l.box[2] > 1.001 || l.box[1] + l.box[3] > 1.001)) return invalid();
    }
  }
  return grade;
}
