'use client';
import { useCallback, useEffect, useState } from 'react';
type Feedback = { understood: boolean; feedback: string; nextStep: string };
type Message = { id: string; answer: string; feedback: string; created_at: string };
export default function TutorPanel({ submissionId, readOnly = false }: { submissionId: string; readOnly?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/tutor?submissionId=${encodeURIComponent(submissionId)}`, { cache: 'no-store' });
    const body = await response.json() as { error?: string; messages: Message[] };
    if (!response.ok) throw new Error(body.error);
    setMessages(body.messages);
  }, [submissionId]);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);
  async function send() {
    if (busy || !answer.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId, answer }) });
      const body = await response.json() as { error?: string; feedback: Feedback };
      if (!response.ok) throw new Error(body.error);
      setAnswer(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '问答失败，请重试'); }
    finally { setBusy(false); }
  }
  return <section className="tutor-panel panel">
    <div className="panel-head"><div><p className="eyebrow">LEARNING DIALOGUE</p><h3>{readOnly ? '学生订正记录' : '再想一步 · 订正与追问'}</h3></div><span className="tag blue">不影响作业成绩</span></div>
    <p className="small muted">{readOnly ? '查看学生的订正过程与辅导反馈。' : '写下你的订正过程，或指出具体哪一步仍有疑问。你也可以在这里尝试拓展题。'}</p>
    <div className="tutor-history" aria-live="polite">
      {messages.map((message) => {
        let feedback: Feedback;
        try { feedback = JSON.parse(message.feedback); } catch { return null; }
        return <article className="tutor-turn" key={message.id}>
          <div className="tutor-student"><span className="eyebrow">学生尝试</span><p>{message.answer}</p></div>
          <div className="tutor-feedback"><span className={feedback.understood ? 'tag green' : 'tag orange'}>{feedback.understood ? '已掌握本次要点' : '继续完善'}</span><p>{feedback.feedback}</p><strong>下一步</strong><p>{feedback.nextStep}</p></div>
        </article>;
      })}
      {!messages.length ? <p className="hint">还没有订正记录。</p> : null}
    </div>
    {!readOnly ? <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="stack">
      <label className="field">我的订正或问题<textarea rows={4} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="例如：第2题第3行除以 x 时，我是不是漏掉了 x=0？我的订正是……" disabled={busy} /></label>
      <button className="primary" disabled={busy || !answer.trim()}>{busy ? '正在分析你的尝试…' : '提交订正 / 向 AI 提问'}</button>
    </form> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
  </section>;
}
