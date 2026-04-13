import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AggregationTemplate, ArticleListItem, CommunitySummary } from '../types';
import { AIPromptEditor } from '../components/AIPromptEditor';

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
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  // コミュニティ投稿用
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState('');

  useEffect(() => {
    api.listAggTemplates().then(setTemplates);
    api.myBookmarks().then(setArticles).catch(() => setArticles([]));
    api.listCommunities().then((list) => setCommunities(list.filter((c) => c.isMember))).catch(() => {});
  }, []);

  const reloadTpl = () => api.listAggTemplates().then(setTemplates);

  const search_ = async () => {
    const r = await api.listArticles({ q, limit: 200 });
    setArticles(r);
    setPage(0);
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

  // markdown を生成して sessionStorage に保存
  const renderAndNavigate = async (dest: string) => {
    if (picked.size === 0) return alert('1件以上選択してください');
    setBusy(true);
    try {
      const r = await api.renderAggregation({
        templateId: selectedTpl || undefined,
        body: selectedTpl ? undefined : tplBody,
        articleIds: Array.from(picked),
        includeSummary,
      });
      sessionStorage.setItem('uchi:editor-prefill', r.markdown);
      nav(dest);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  // 通常記事として作成
  const renderAsArticle = () => renderAndNavigate('/editor?prefill=1');

  // コミュニティ投稿として作成
  const renderAsCommunityPost = () => {
    if (!selectedCommunityId) return alert('投稿先コミュニティを選んでください');
    renderAndNavigate(`/communities/${selectedCommunityId}/editor?prefill=1`);
  };

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>まとめ記事作成</h2>
      <p style={{ color: 'var(--muted)', fontSize: 15 }}>複数の記事を1つのまとめ記事にします。テンプレート内の <code>{'{{articles}}'}</code> が記事ブロックに置換されます。</p>

      <AIPromptEditor />

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>テンプレート</h3>
        <select value={selectedTpl} onChange={(e) => loadTpl(e.target.value)}
          style={{ marginBottom: 8 }}>
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
          style={{ width: '100%', minHeight: 160, padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 15 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={saveTpl}>テンプレートを保存</button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>まとめる記事を選択</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            placeholder="検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search_()}
            style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 6, flex: 1 }}
          />
          <button className="btn" onClick={search_}>検索</button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              api.myBookmarks().then(setArticles);
              setPage(0);
            }}
          >
            ブックマーク
          </button>
        </div>

        {(() => {
          const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages - 1);
          const visible = articles.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
          return (
            <>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>
                {articles.length} 件中 {safePage * PAGE_SIZE + 1}〜
                {Math.min(articles.length, safePage * PAGE_SIZE + PAGE_SIZE)} 件
                ・選択中 {picked.size} 件
              </div>
              {visible.map((a) => (
                <div
                  key={a.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  <span style={{ fontSize: 20 }}>{a.emoji || '📝'}</span>
                  <span style={{ flex: 1 }}>{a.title}</span>
                </div>
              ))}
              {articles.length === 0 && (
                <div style={{ color: 'var(--muted)', padding: 12 }}>候補がありません</div>
              )}
              {totalPages > 1 && (
                <div className="agg-pagination">
                  <button
                    className="btn btn-ghost"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    « 前
                  </button>
                  <span style={{ fontSize: 15, color: 'var(--muted)' }}>
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    className="btn btn-ghost"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    次 »
                  </button>
                </div>
              )}
            </>
          );
        })()}

        <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={includeSummary}
            onChange={(e) => setIncludeSummary(e.target.checked)}
          />
          各記事のAI要約を含める
        </label>
      </div>

      {/* ========== 2つのアクションボタン ========== */}
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 通常記事 */}
        <button
          className="btn"
          disabled={busy || picked.size === 0}
          onClick={renderAsArticle}
          style={{ minWidth: 180 }}
        >
          {busy ? '生成中…' : 'まとめ記事を作る'}
        </button>

        {/* コミュニティ投稿 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={selectedCommunityId}
              onChange={(e) => setSelectedCommunityId(e.target.value)}
              style={{ minWidth: 200 }}
            >
              <option value="">コミュニティを選択…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              className="btn"
              disabled={busy || picked.size === 0 || !selectedCommunityId}
              onClick={renderAsCommunityPost}
              style={{
                minWidth: 200,
                border: '2px solid var(--accent)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {busy ? '生成中…' : 'まとめコミュニティ投稿を作る'}
            </button>
          </div>
          {communities.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              参加中のコミュニティがありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
