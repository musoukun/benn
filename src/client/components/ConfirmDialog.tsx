import React from 'react';

// シンプルな はい / いいえ 確認モーダル
// open=true のとき backdrop + modal を表示
export function ConfirmDialog({
  open,
  title,
  message,
  yesLabel = 'はい',
  noLabel = 'いいえ',
  yesDanger = false,
  onYes,
  onNo,
}: {
  open: boolean;
  title: string;
  message?: string;
  yesLabel?: string;
  noLabel?: string;
  yesDanger?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  if (!open) return null;
  return (
    <div className="confirm-backdrop" onClick={onNo}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="confirm-modal-actions">
          <button className="btn-cancel" onClick={onNo}>
            {noLabel}
          </button>
          <button className={yesDanger ? 'btn-danger' : 'btn-cancel'} onClick={onYes}>
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
