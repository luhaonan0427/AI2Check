'use client';

// 拍照提交面板：本地先校验类型/大小 → 显示缩略图 → 逐张 POST /api/files →
// POST /api/submission（action=submit，带 assignmentId 与 files id）。
// 上传期间禁用按钮并显示进度。

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Assignment, Submission } from '@/app/domain';
import {
  apiPost,
  MAX_FILES,
  messageOf,
  uploadImage,
  validateImage,
  type SubmitResponse,
} from './api';

type PhotoState = 'ready' | 'uploading' | 'done' | 'failed';

type PhotoItem = {
  key: string;
  file: File;
  /** 本地预览地址（URL.createObjectURL）。 */
  url: string;
  state: PhotoState;
};

const STATE_LABEL: Record<PhotoState, string> = {
  ready: '待上传',
  uploading: '上传中…',
  done: '已上传',
  failed: '上传失败',
};

const STATE_TONE: Record<PhotoState, string> = {
  ready: 'tag neutral',
  uploading: 'tag blue',
  done: 'tag green',
  failed: 'tag red',
};

let keySeed = 0;

function nextKey(): string {
  keySeed += 1;
  return `photo-${keySeed}-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  assignment: Assignment;
  onClose: () => void;
  onSubmitted: (submission: Submission) => void;
};

export default function SubmitPanel({ assignment, onClose, onSubmitted }: Props) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [percent, setPercent] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<PhotoItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 关闭面板时释放缩略图占用的内存。
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );

  /** 加入新选择的照片：先本地校验，再补进列表。 */
  function addPhotos(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const problems: string[] = [];
    const accepted: PhotoItem[] = [];
    let room = MAX_FILES - items.length;
    let skippedForLimit = 0;

    for (const file of incoming) {
      const problem = validateImage(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      if (room <= 0) {
        skippedForLimit += 1;
        continue;
      }
      accepted.push({
        key: nextKey(),
        file,
        url: URL.createObjectURL(file),
        state: 'ready',
      });
      room -= 1;
    }

    if (skippedForLimit > 0) {
      problems.push(`最多只能上传 ${MAX_FILES} 张照片，超出的 ${skippedForLimit} 张已忽略`);
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
      setRequestError(null);
    }
    setFileError(problems.length > 0 ? problems.join('；') : null);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    addPhotos(event.target.files);
    // 允许重复选择同一张照片。
    event.target.value = '';
  }

  function removePhoto(key: string) {
    const target = items.find((item) => item.key === key);
    if (target) URL.revokeObjectURL(target.url);
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  async function submit() {
    if (busy) return;
    if (items.length === 0) {
      setFileError('请至少选择一张作业照片');
      return;
    }

    setBusy(true);
    setFileError(null);
    setRequestError(null);
    setPercent(0);
    const snapshot = items;
    setStage(`正在上传第 1 / ${snapshot.length} 张…`);
    setItems((prev) => prev.map((item) => ({ ...item, state: 'ready' as PhotoState })));

    try {
      const fileIds: string[] = [];
      for (let index = 0; index < snapshot.length; index += 1) {
        const current = snapshot[index];
        setStage(`正在上传第 ${index + 1} / ${snapshot.length} 张…`);
        setItems((prev) =>
          prev.map((item) => (item.key === current.key ? { ...item, state: 'uploading' } : item)),
        );
        const id = await uploadImage(current.file);
        fileIds.push(id);
        setItems((prev) =>
          prev.map((item) => (item.key === current.key ? { ...item, state: 'done' } : item)),
        );
        setPercent(Math.round(((index + 1) / snapshot.length) * 100));
      }

      setStage('照片已上传，正在提交并生成批改建议…');
      const result = await apiPost<SubmitResponse>('/api/submission', {
        action: 'submit',
        assignmentId: assignment.id,
        files: fileIds,
      });
      onSubmitted(result.submission);
    } catch (err) {
      setRequestError(messageOf(err));
      setStage('');
      setItems((prev) =>
        prev.map((item) => (item.state === 'uploading' ? { ...item, state: 'failed' } : item)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-mask stu-modal-mask">
      <div className="modal stu-modal" role="dialog" aria-modal="true" aria-label="拍照提交作业">
        <div className="modal-head">
          <div>
            <h2>拍照提交作业</h2>
            <p>
              {assignment.title} · 满分 {assignment.maxScore} 分
            </p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="stack">
          <p className="hint">
            支持 JPG / PNG / WebP，单张不超过 8 MB，最多 {MAX_FILES} 张。手机可直接唤起相机或相册；
            请让题目与解题过程完整、字迹清晰。AI 批改照片总大小需不超过16MB。重新提交会覆盖上一次记录。
          </p>

          <div className="actions stu-actions">
            <button
              className="secondary"
              type="button"
              disabled={busy || items.length >= MAX_FILES}
              onClick={() => inputRef.current?.click()}
            >
              选择或拍摄照片
            </button>
            <span className="small muted">
              已选 {items.length} / {MAX_FILES} 张
            </span>
          </div>
          <input
            ref={inputRef}
            className="stu-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onInputChange}
            aria-label="选择作业照片"
          />

          {fileError ? <p className="error-text">{fileError}</p> : null}

          {items.length === 0 ? (
            <div className="empty">
              <strong>还没有选择照片</strong>
              拍下整页作业，注意光线充足、不要缺边或反光。
            </div>
          ) : (
            <div className="stu-thumbs">
              {items.map((item, index) => (
                <div className="stu-thumb" key={item.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={`第 ${index + 1} 张照片预览`} />
                  <button
                    className="stu-thumb-remove"
                    type="button"
                    disabled={busy}
                    onClick={() => removePhoto(item.key)}
                    aria-label={`移除第 ${index + 1} 张照片`}
                  >
                    ×
                  </button>
                  <span className={`stu-thumb-state ${STATE_TONE[item.state]}`}>
                    {STATE_LABEL[item.state]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {busy ? (
            <div className="stu-progress" role="status" aria-live="polite">
              <div className="bar">
                <i style={{ width: `${percent}%` }} />
              </div>
              <p className="small muted">{stage}</p>
            </div>
          ) : null}

          {requestError ? (
            <p className="error-text" role="alert">
              {requestError}
            </p>
          ) : null}
        </div>

        <div className="modal-foot">
          <button className="secondary" type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => {
              void submit();
            }}
            disabled={busy || items.length === 0}
          >
            {busy ? '正在提交…' : `提交作业（${items.length} 张）`}
          </button>
        </div>
      </div>
    </div>
  );
}
