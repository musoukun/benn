import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleListItem } from '../types';

export function SummarizePage() {
  const [source, setSource] = useState<'bookmark' | 'search'>('bookmark');
  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ id: string; title: string; url: string; summary: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (source === 'bookmark') api.myBookmarks().then(setItems).catch(() => setItems([]));
  }, [source]);

  useEffect(() => {
    api.getPrompts().then((p) => setCustomPrompt(p.summary));
  }, []);

  const search = async () => {
    const r = await api.listArticles({ q, limit: 50 });
    setItems(r);
  };

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  const run = async () => {
    if (selected.size === 0) return alert('1件以上選択してください');
    setBusy(true);
    try {
      const r = await api.summarize(Array.from(selected), customPrompt);
      setResults(r.items);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buildMd = () => {
    return results.map((r) => `# ${r.title}\n${window.location.origin}${r.url}\n\n${r.summary}\n`).join('\n');
  };

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>記事の要約</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>複数の記事を選択してAIに要約させ、まとめレポートに使えます。</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={'btn ' + (source === 'bookmark' ? '' : 'btn-ghost')} onClick={() => setSource('bookmark')}>ブックマークから</button>
        <button className={'btn ' + (source === 'search' ? '' : 'btn-ghost')} onClick={() => setSource('search')}>検索から</button>
        <button className="btn btn-ghost" onClick={() => setShowPrompt((v) => !v)}>プロンプト編集</button>
      </div>

      {showPrompt && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ marginTop: 0 }}>このセッションのプロンプト</h4>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            style={{ width: '100%', minHeight: 120, padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}
          />
          <button className="btn" style={{ marginTop: 8 }} onClick={async () => { await api.setPrompt('summary', customPrompt); alert('デフォルトとして保存しました'); }}>デフォルトとして保存</button>
        </div>
      )}

      {source === 'search' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="検索キーワード"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, flex: 1 }}
          />
          <button className="btn" onClick={search}>検索</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        {items.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
            <span style={{ fontSize: 22 }}>{a.emoji || '📝'}</span>
            <span style={{ flex: 1 }}>{a.title}</span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{a.author?.name}</span>
          </div>
        ))}
      </div>

      <button className="btn" disabled={busy || selected.size === 0} onClick={run}>
        {busy ? '要約中…' : `${selected.size} 件を要約`}
      </button>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>結果</h3>
          {results.map((r) => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 4px' }}>{r.title}</h4>
              <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
              <p style={{ marginTop: 8 }}>{r.summary}</p>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 12 }} onClick={() => {
            const md = buildMd();
            navigator.clipboard.writeText(md);
            alert('クリップボードにコピーしました');
          }}>Markdownでコピー</button>
        </div>
      )}
    </div>
  );
}
