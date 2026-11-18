'use client';
import type { Grade } from '@/app/domain';

export default function AnswerPhoto({ src, page, grade, alt }: { src: string; page: number; grade: Grade | null; alt: string }) {
  const lines = (grade?.questions ?? []).flatMap((question) => question.lines.map((line) => ({ ...line, question: question.number }))).filter((line) => line.page === page && line.box && line.issue);
  return <figure className="answer-photo">
    <div className="answer-photo-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
      {lines.map((line, index) => <span key={index} className={`answer-mark ${line.isFirstError ? 'first' : ''}`}
        title={`第${line.question}题 · 第${line.line}行：${line.issue}`}
        style={{ left: `${line.box![0] * 100}%`, top: `${line.box![1] * 100}%`, width: `${line.box![2] * 100}%`, height: `${line.box![3] * 100}%` }}>
        <span>第 {line.line} 行</span>
      </span>)}
    </div>
    <figcaption>第 {page} 页 · <a href={src} target="_blank" rel="noreferrer">查看原图</a>{lines.length ? ' · 标记处为 AI 建议，请对照原文核实' : ''}</figcaption>
  </figure>;
}
