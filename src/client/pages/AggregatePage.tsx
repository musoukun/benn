import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AggregationTemplate, ArticleListItem } from '../types';

export function AggregatePage() {
  const nav = useNavigate();
  const [templates, setTemplates] = useState<AggregationTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>('');
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('# まとめ記事\n\n以下の記事を集約しました。\n\n{{articles}}\n');
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [includeSummary, setIncludeSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.listAggTemplates().then(setTemplates);
    api.myBookmarks().then(setArticles).catch(() => setArticles([]));
  }, []);

  const reloadTpl = () => api.listAggTemplates().then(setTemplates);

  const search = async () => {
    const r = await api.listArticles({ q, limit: 50 });
    setArticles(r);
  };

  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setPicked(n);
  };

  const saveTpl = async () => {
    if (!tplName.trim()) return alert('テンプレート名を入力');
    if (selectedTpl) {
      await api.updateAggTemplate(selectedTpl, tplName, tplBody);
    } else {
      const t = await api.createAggTemplate(tplName, tplBody);
      setSelectedTpl(t.id);
    }
    reloadTpl();
    alert('保存しました');
  };

  const loadTpl = (id: string) => {
    setSelectedTpl(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setTplName(t.name);
      setTplBody(t.body);
    }
  };

  const render = async () => {
    if (picked.size === 0) return alert('1件以上選択してください');
    setBusy(true);
    try {
      const r = await api.renderAggregation({
        templateId: selectedTpl || undefined,
        body: selectedTpl ? undefined : tplBody,
        articleIds: Array.from(picked),
        includeSummary,
      });
      // 結果をエディタに渡す (sessionStorage 経由)
      sessionStorage.setItem('uchi:editor-prefill', r.markdown);
      nav('/editor?prefill=1');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>記事の集約</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>複数の記事を1つのまとめ記事にします。テンプレート内の <code>{'{{articles}}'}</code> が記事ブロックに置換されます。</p>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>テンプレート</h3>
        <select value={selectedTpl} onChange={(e) => loadTpl(e.target.value)}
          style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8 }}>
          <option value="">(新規)</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          placeholder="テンプレート名"
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8 }}
        />
        <textarea
          value={tplBody}
          onChange={(e) => setTplBody(e.target.value)}
          style={{ width: '100%', minHeight: 160, padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={saveTpl}>テンプレートを保存</button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>集約する記事を選択</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            placeholder="検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 6, flex: 1 }}
          />
          <button className="btn" onClick={search}>検索</button>
          <button className="btn btn-ghost" onClick={() => api.myBookmarks().then(setArticles)}>ブックマーク</button>
        </div>
        {articles.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
            <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
            <span style={{ fontSize: 18 }}>{a.emoji || '📝'}</span>
            <span style={{ flex: 1 }}>{a.title}</span>
          </div>
        ))}
        <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
          各記事のAI要約を含める
        </label>
      </div>

      <button className="btn" disabled={busy || picked.size === 0} onClick={render}>
        {busy ? '生成中…' : '集約してエディタで開く'}
      </button>
    </div>
  );
}
