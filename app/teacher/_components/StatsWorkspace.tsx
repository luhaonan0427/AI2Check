'use client';

// 成绩统计页：每次作业一列，展示已审核加权均分、审核进度与总评完整性，并支持导出 CSV。
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, downloadCsv, errorMessage } from './api';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './StateBlocks';
import { TeacherShell } from './TeacherShell';
import { formatDateTime, percent, scoreText } from './format';
import type { MeResponse, StatsResponse } from './types';
import type { StudentTotals } from '@/db/store';

type StatsEntry = StudentTotals['entries'][number];

/** 单元格：未提交 / 待批改 / 待审核（建议分）/ 已审核定稿分。 */
function EntryCell({ entry }: { entry: StatsEntry | null }) {
  if (!entry || !entry.submission) return <span className="muted">未提交</span>;

  if (entry.approved) {
    return (
      <>
        <strong>{scoreText(entry.countedScore)}</strong>
        <span className="small muted block">已审核定稿</span>
      </>
    );
  }

  if (entry.countedScore == null) return <span className="muted">待批改</span>;

  return (
    <>
      <strong className="muted-strong">{scoreText(entry.countedScore)}</strong>
      <span className="block">
        <span className="tag orange">待审核</span>
      </span>
      <span className="small muted block">建议分，未计入均分</span>
    </>
  );
}

export function StatsWorkspace({ courseId }: { courseId: string }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [stats, me] = await Promise.all([
        apiGet<StatsResponse>(`/api/stats?courseId=${encodeURIComponent(courseId)}`),
        apiGet<MeResponse>('/api/me').catch(() => null),
      ]);
      setData(stats);
      setUserName(me?.user.displayName ?? '');
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    // load 的 setState 都发生在 await 之后；放进微任务，避免被判定为 effect 同步阶段写状态。
    void Promise.resolve().then(() => load());
  }, [courseId, load]);

  /** 手动刷新：由点击触发，这里显式进入加载态。 */
  async function handleRefresh() {
    setLoading(true);
    setError('');
    await load();
  }

  async function handleExport() {
    if (!courseId || exporting) return;
    setExporting(true);
    setExportError('');
    setExportNotice('');
    try {
      await downloadCsv('/api/stats', { courseId }, 'mathflow-grades.csv');
      setExportNotice('CSV 已开始下载，可直接用 Excel 打开。');
    } catch (caught) {
      setExportError(errorMessage(caught));
    } finally {
      setExporting(false);
    }
  }

  if (!courseId) {
    return (
      <TeacherShell active="stats" title="成绩统计" userName={userName || undefined}>
        <section className="panel">
          <EmptyBlock title="请先选择一门课程" hint={<Link href="/teacher">返回我的课程</Link>} />
        </section>
      </TeacherShell>
    );
  }

  const students = data?.totals ?? [];
  const assignments = data?.assignments ?? [];
  const slots = students.length * assignments.length;
  const approvedSlots = students.reduce((total, student) => total + student.approvedCount, 0);
  const submittedSlots = students.reduce((total, student) => total + student.submittedCount, 0);
  const completeStudents = students.filter((student) => student.complete).length;
  const averages = students
    .map((student) => student.average)
    .filter((value): value is number => value != null);
  const classAverage = averages.length
    ? averages.reduce((total, value) => total + value, 0) / averages.length
    : null;

  return (
    <TeacherShell
      active="stats"
      title={data ? `${data.course.name} · 成绩统计` : '成绩统计'}
      subtitle={data ? `${students.length} 名学生 · ${assignments.length} 次作业` : undefined}
      userName={userName || undefined}
    >
      {loading ? <LoadingBlock label="正在加载成绩统计…" /> : null}

      {!loading && error ? (
        <>
          <ErrorBlock message={`加载统计失败：${error}`} onRetry={() => void load()} />
          <section className="panel">
            <EmptyBlock title="无法显示这门课程的统计" hint={<Link href="/teacher">返回我的课程</Link>} />
          </section>
        </>
      ) : null}

      {!loading && !error && data ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">成绩统计</p>
                <h2>{data.course.name}</h2>
                <p className="small muted">
                  {data.course.code}
                  {data.course.term ? ` · ${data.course.term}` : ''}
                  {' '}· 课程码 {data.course.joinCode}
                </p>
              </div>
              <div className="actions">
                <Link className="secondary" href={`/teacher/course?id=${encodeURIComponent(courseId)}`}>
                  课程管理与审核
                </Link>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleRefresh()}
                  disabled={loading}
                >
                  刷新
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleExport()}
                  disabled={exporting || assignments.length === 0}
                >
                  {exporting ? '导出中…' : '导出 CSV'}
                </button>
              </div>
            </div>

            {exportError ? (
              <p className="error-text" role="alert">
                {exportError}
              </p>
            ) : null}
            {exportNotice ? (
              <p className="ok-text" role="status">
                {exportNotice}
              </p>
            ) : null}
            <p className="hint">
              均分算法：先把每次作业按满分归一到百分制，再按作业权重加权；未提交与未审核都不计零。
            </p>
          </section>

          {assignments.length === 0 ? (
            <section className="panel">
              <EmptyBlock
                title="还没有作业"
                hint={
                  <>
                    先到
                    <Link href={`/teacher/course?id=${encodeURIComponent(courseId)}`}>课程管理</Link>
                    发布作业，统计表会按每次作业自动生成一列。
                  </>
                }
              />
            </section>
          ) : students.length === 0 ? (
            <section className="panel">
              <EmptyBlock
                title="还没有学生加入"
                hint={`把课程码 ${data.course.joinCode} 发给学生，学生加入后这里会出现他们的成绩行。`}
              />
            </section>
          ) : (
            <>
              <div className="grid cols-4">
                <div className="stat">
                  <span>学生人数</span>
                  <strong>
                    {students.length}
                    <em>人</em>
                  </strong>
                  <p>含全部已加入课程的学生</p>
                </div>
                <div className="stat">
                  <span>作业次数</span>
                  <strong>
                    {assignments.length}
                    <em>次</em>
                  </strong>
                  <p>统计表中每次作业一列</p>
                </div>
                <div className="stat">
                  <span>审核进度</span>
                  <strong>
                    {percent(approvedSlots, slots)}
                    <em>%</em>
                  </strong>
                  <div className="bar stat-bar">
                    <i style={{ width: `${percent(approvedSlots, slots)}%` }} />
                  </div>
                  <p>
                    已审核 {approvedSlots} / 应审核 {slots} 份；已提交 {submittedSlots} 份
                  </p>
                </div>
                <div className="stat">
                  <span>已审核加权均分</span>
                  <strong>{classAverage == null ? '—' : classAverage.toFixed(1)}</strong>
                  <p>
                    总评完整 {completeStudents} / {students.length} 人
                    {completeStudents < students.length ? '（未完整者标「暂定」）' : ''}
                  </p>
                </div>
              </div>

              <section className="panel">
                <div className="panel-head">
                  <h2>多轮作业成绩表</h2>
                  <span className="small muted">
                    每次作业一列；complete=false 的均分为暂定值
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="data stats-table">
                    <thead>
                      <tr>
                        <th className="sticky-col">学生</th>
                        {assignments.map((assignment) => (
                          <th key={assignment.id}>
                            {assignment.title}
                            <span className="th-sub">
                              {formatDateTime(assignment.due)} 截止 · 满分 {assignment.maxScore} · 权重{' '}
                              {assignment.weight}
                            </span>
                          </th>
                        ))}
                        <th>已审核加权均分</th>
                        <th>审核进度</th>
                        <th>总评</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => (
                        <tr key={student.studentId}>
                          <td className="sticky-col">
                            <strong>{student.displayName}</strong>
                            <span className="small muted block">
                              {student.studentNumber ?? '未填学号'}
                            </span>
                          </td>
                          {assignments.map((assignment) => (
                            <td key={assignment.id}>
                              <EntryCell
                                entry={
                                  student.entries.find(
                                    (item) => item.assignment.id === assignment.id,
                                  ) ?? null
                                }
                              />
                            </td>
                          ))}
                          <td>
                            <strong>{student.average == null ? '—' : student.average.toFixed(1)}</strong>
                            <span className="block">
                              {student.complete ? (
                                <span className="tag green">完整</span>
                              ) : (
                                <span className="tag orange">暂定</span>
                              )}
                            </span>
                            <span className="small muted block">
                              已审核 {student.approvedCount}/{assignments.length}
                            </span>
                          </td>
                          <td>
                            <div className="progress-cell">
                              <span className="small muted">
                                已审核 {student.approvedCount}/{assignments.length} · 已提交{' '}
                                {student.submittedCount} 份
                              </span>
                              <div className="bar stat-bar">
                                <i
                                  style={{
                                    width: `${percent(student.approvedCount, assignments.length)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            {student.complete ? (
                              <span className="tag green">完整</span>
                            ) : (
                              <span className="tag orange">暂定</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  未审核的提交只显示批改建议分，不参与均分；全部作业审核完成后总评才会标记为「完整」。
                </p>
              </section>
            </>
          )}
        </>
      ) : null}
    </TeacherShell>
  );
}
