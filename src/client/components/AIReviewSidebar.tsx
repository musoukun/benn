import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { AIReview } from '../types';
import { BotIcon } from './BotIcon';

// EditorPage から渡されるコールバック:
// - body: 現在のエディタ本文 (行参照に使う)
// - onApplyLineFix(line, newText): L行 を newText で置換 (newText は複数行可)
// - onAppendBody(text): 本文末尾に text を追記
export function AIReviewSidebar({
  articleId,
  body,
  onApplyLineFix,
  onAppendBody,
  open: openProp,
  onOpenChange,
}: {
  articleId: string | null;
  body: string;
  onApplyLineFix?: (line: number, newText: string) => void;
  onAppendBody?: (text: string) => void;
  open?: boolean;          // controlled open
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInner, setOpenInner] = useState(false);
  const open = openProp !== undefined ? openProp : openInner;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as any)(open) : v;
    if (openProp === undefined) setOpenInner(next);
    onOpenChange?.(next);
  };
  const [reviews, setReviews] = useState<AIReview[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 「AI 修正提案」プレビュー
  // key 形式:
  //   line:{rid}:{i}  (line comment ごと)
  //   imp:{rid}:{i}   (improvement ごと)
  type Suggestion = { loading: boolean; text?: string; error?: string };
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});

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

  // 提案生成 (AI 呼び出し)
  const generateSuggestion = async (
    key: string,
    mode: 'line' | 'append',
    instruction: string,
    line?: number
  ) => {
    if (!articleId) return;
    setSuggestions((p) => ({ ...p, [key]: { loading: true } }));
    try {
      const r = await api.suggestFix(articleId, { mode, instruction, line });
      setSuggestions((p) => ({ ...p, [key]: { loading: false, text: r.text } }));
    } catch (e: any) {
      setSuggestions((p) => ({
        ...p,
        [key]: { loading: false, error: e.message || '生成に失敗しました' },
      }));
    }
  };

  // 適用 (本文に反映)
  const applyLine = (key: string, line: number) => {
    const s = suggestions[key];
    if (!s?.text) return;
    onApplyLineFix?.(line, s.text);
    setSuggestions((p) => ({ ...p, [key]: { ...s, text: undefined } })); // 適用後はクリア
  };
  const applyAppend = (key: string) => {
    const s = suggestions[key];
    if (!s?.text) return;
    onAppendBody?.(s.text);
    setSuggestions((p) => ({ ...p, [key]: { ...s, text: undefined } }));
  };

  if (!open) return null;

  return (
    <aside className="ai-review-sidebar open">
      <div className="ai-review-backdrop" onClick={() => setOpen(false)} />
      <div className="ai-review-content">
          <div className="ai-review-head">
            <button
              className="ai-review-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
              title="閉じる"
            >
              {'»'}
            </button>
            <h3>レビュー</h3>
          </div>
          <div className="ai-review-section">
            <div className="ai-review-label-strong">レビュアー</div>
            <button
              className="ai-review-run-btn"
              disabled={reviewing || !articleId}
              onClick={run}
              title={!articleId ? 'まず下書き保存してください' : ''}
            >
              <BotIcon size={16} />
              <span>{reviewing ? 'レビュー中…' : reviews.length > 0 ? 'AIレビューを再実行' : 'AIレビューを実行'}</span>
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
                  <ul className="ai-review-improvements">
                    {rv.improvements.map((g, i) => {
                      const key = `imp:${rv.id}:${i}`;
                      const s = suggestions[key];
                      return (
                        <li key={i}>
                          <div>{g}</div>
                          {idx === 0 && (
                            <div className="ai-review-fix">
                              {!s?.text && (
                                <button
                                  className="btn btn-ghost ai-review-fix-btn"
                                  disabled={s?.loading}
                                  onClick={() => generateSuggestion(key, 'append', g)}
                                >
                                  {s?.loading ? '生成中…' : '✨ AI で追記文を生成'}
                                </button>
                              )}
                              {s?.error && <div className="ai-review-err">{s.error}</div>}
                              {s?.text && (
                                <div className="ai-review-suggestion">
                                  <div className="ai-review-suggestion-label">提案:</div>
                                  <pre className="ai-review-suggestion-text">{s.text}</pre>
                                  <div className="ai-review-suggestion-actions">
                                    <button
                                      className="btn ai-review-fix-btn"
                                      onClick={() => applyAppend(key)}
                                    >
                                      ✔ 記事末尾に追記
                                    </button>
                                    <button
                                      className="btn btn-ghost ai-review-fix-btn"
                                      onClick={() =>
                                        setSuggestions((p) => ({ ...p, [key]: { loading: false } }))
                                      }
                                    >
                                      キャンセル
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {rv.lineComments?.length > 0 && (
                <div className="ai-review-section">
                  <div className="ai-review-label">📍 行コメント</div>
                  {rv.lineComments.map((lc, i) => {
                    const key = `line:${rv.id}:${i}`;
                    const s = suggestions[key];
                    const lines = body.split('\n');
                    const target = lines[lc.line - 1] || '';
                    return (
                      <div key={i} className="ai-review-line">
                        <div className="ai-review-line-no">L{lc.line}</div>
                        <div className="ai-review-line-src">{target}</div>
                        <div className="ai-review-line-body">{lc.body}</div>
                        {idx === 0 && (
                          <div className="ai-review-fix">
                            {!s?.text && (
                              <button
                                className="btn btn-ghost ai-review-fix-btn"
                                disabled={s?.loading}
                                onClick={() => generateSuggestion(key, 'line', lc.body, lc.line)}
                              >
                                {s?.loading ? '生成中…' : '✨ AI修正案を生成'}
                              </button>
                            )}
                            {s?.error && <div className="ai-review-err">{s.error}</div>}
                            {s?.text && (
                              <div className="ai-review-suggestion">
                                <div className="ai-review-suggestion-label">置換案:</div>
                                <pre className="ai-review-suggestion-text">{s.text}</pre>
                                <div className="ai-review-suggestion-actions">
                                  <button
                                    className="btn ai-review-fix-btn"
                                    onClick={() => applyLine(key, lc.line)}
                                  >
                                    ✔ 適用 (L{lc.line} を置換)
                                  </button>
                                  <button
                                    className="btn btn-ghost ai-review-fix-btn"
                                    onClick={() =>
                                      setSuggestions((p) => ({ ...p, [key]: { loading: false } }))
                                    }
                                  >
                                    キャンセル
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
      </div>
    </aside>
  );
}
