import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { AIReview } from '../types';

export function AIReviewSidebar({
  articleId,
  body,
}: {
  articleId: string | null; // 新規作成中は null (まず保存しないと走らせられない)
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<AIReview[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!articleId) return;
    api.listReviews(articleId).then(setReviews).catch(() => setReviews([]));
  }, [articleId]);

  const run = async () => {
    if (!articleId) {
      setErr('まず下書き保存してください (AI レビューは保存済みの記事に対して走ります)');
      return;
    }
    setReviewing(true);
    setErr(null);
    try {
      const r = await api.reviewArticle(articleId);
      setReviews((prev) => [r, ...prev]);
      setOpen(true);
    } catch (e: any) {
      setErr(e.message || 'AI レビューに失敗しました');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <aside className={'ai-review-sidebar ' + (open ? 'open' : 'closed')}>
      <button
        className="ai-review-toggle"
        onClick={() => setOpen((v) => !v)}
        title={open ? '閉じる' : 'AIレビューを開く'}
      >
        {open ? '▶' : '🤖'}
      </button>
      {open && (
        <div className="ai-review-content">
          <div className="ai-review-head">
            <h3>🤖 AIレビュー</h3>
            <button
              className="btn"
              disabled={reviewing || !articleId}
              onClick={run}
              title={!articleId ? 'まず下書き保存してください' : ''}
            >
              {reviewing ? 'レビュー中…' : reviews.length > 0 ? '再レビュー' : '実行'}
            </button>
          </div>
          {!articleId && (
            <div className="ai-review-empty">
              新規作成中はレビューできません。<br />
              まず「下書き保存」してから実行してください。
            </div>
          )}
          {err && <div className="ai-review-err">{err}</div>}
          {reviews.length === 0 && articleId && !reviewing && (
            <div className="ai-review-empty">
              まだレビュー結果はありません。<br />
              「実行」ボタンを押すと、設定済みの AI が記事をレビューします。
            </div>
          )}
          {reviews.map((rv, idx) => (
            <div key={rv.id} className="ai-review-item">
              <div className="ai-review-meta">
                {rv.user?.name || 'AI'} · {rv.createdAt?.slice(0, 16).replace('T', ' ')}
                {idx === 0 && <span className="badge badge-public" style={{ marginLeft: 6 }}>最新</span>}
              </div>
              {rv.summary && (
                <div className="ai-review-section">
                  <div className="ai-review-label">📝 講評</div>
                  <div className="ai-review-text">{rv.summary}</div>
                </div>
              )}
              {rv.goodPoints?.length > 0 && (
                <div className="ai-review-section">
                  <div className="ai-review-label">👍 良い点</div>
                  <ul>{rv.goodPoints.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
              {rv.improvements?.length > 0 && (
                <div className="ai-review-section">
                  <div className="ai-review-label">💡 改善点</div>
                  <ul>{rv.improvements.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
              {rv.lineComments?.length > 0 && (
                <div className="ai-review-section">
                  <div className="ai-review-label">📍 行コメント</div>
                  {rv.lineComments.map((lc, i) => {
                    const lines = body.split('\n');
                    const target = lines[lc.line - 1] || '';
                    return (
                      <div key={i} className="ai-review-line">
                        <div className="ai-review-line-no">L{lc.line}</div>
                        <div className="ai-review-line-src">{target}</div>
                        <div className="ai-review-line-body">{lc.body}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
