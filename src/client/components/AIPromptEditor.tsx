import React, { useEffect, useState } from 'react';
import { api } from '../api';

// AI 用プロンプト編集パネル。
// 「レビュー用プロンプト」と「要約用プロンプト」の両方を 1 箇所で編集できる。
// 現状は /me/settings の「AI プロンプト」タブで編集していたが、
// 利用画面 (要約 / まとめ記事作成) からも直接編集できるように切り出した共通 UI。
//
// 折り畳み式で、デフォルトは閉じた状態。「✏ AI プロンプトを編集」を押すと展開する。
export function AIPromptEditor({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState('');
  const [summary, setSummary] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savedKind, setSavedKind] = useState<'review' | 'summary' | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    api
      .getPrompts()
      .then((p) => {
        setReview(p.review);
        setSummary(p.summary);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  // savedKind の自動消去
  useEffect(() => {
    if (!savedKind) return;
    const t = setTimeout(() => setSavedKind(null), 2000);
    return () => clearTimeout(t);
  }, [savedKind]);

  const saveReview = async () => {
    setSavingReview(true);
    try {
      await api.setPrompt('review', review);
      setSavedKind('review');
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSavingReview(false);
    }
  };

  const saveSummary = async () => {
    setSavingSummary(true);
    try {
      await api.setPrompt('summary', summary);
      setSavedKind('summary');
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 13 }}>{open ? '▼' : '▶'}</span>
        ✏ AI プロンプトを編集 (レビュー / 要約)
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {!loaded ? (
            <div className="loading">読み込み中…</div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 6px' }}>レビュー用プロンプト</h4>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                  記事ページの「🤖 AI レビュー」で使われます
                </div>
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 180,
                    padding: 10,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 14,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <button className="btn" onClick={saveReview} disabled={savingReview}>
                    {savingReview ? '保存中…' : 'レビュー用を保存'}
                  </button>
                  {savedKind === 'review' && (
                    <span style={{ fontSize: 13, color: 'var(--accent)' }}>保存しました ✓</span>
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 6px' }}>要約用プロンプト</h4>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                  「記事の要約」や「まとめ記事作成 (各記事のAI要約を含めるON時)」で使われます
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 140,
                    padding: 10,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 14,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <button className="btn" onClick={saveSummary} disabled={savingSummary}>
                    {savingSummary ? '保存中…' : '要約用を保存'}
                  </button>
                  {savedKind === 'summary' && (
                    <span style={{ fontSize: 13, color: 'var(--accent)' }}>保存しました ✓</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
