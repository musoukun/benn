import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';

type Tab = 'article' | 'community' | 'post';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') || '';
  const initialTab = (params.get('type') as Tab) || 'article';
  const [q, setQ] = useState(initialQ);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = (newQ?: string, newTab?: Tab) => {
    const finalQ = newQ ?? q;
    const finalTab = newTab ?? tab;
    setParams({ q: finalQ, type: finalTab });
    if (!finalQ.trim()) {
      setItems([]);
      return;
    }
    setLoading(true);
    api
      .search(finalQ, finalTab)
      .then((r) => {
        setItems(r.items);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
  };

  // 初回 + クエリ変化で再検索
  useEffect(() => {
    if (initialQ) submit(initialQ, initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブ切替時に再検索
  const switchTab = (t: Tab) => {
    setTab(t);
    submit(q, t);
  };

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>🔍 検索</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="search"
          style={{ flex: 1, fontSize: 16, padding: '10px 14px' }}
          placeholder="キーワードで検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          autoFocus
        />
        <button className="btn" onClick={() => submit()}>
          検索
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'article' ? 'active' : ''} onClick={() => switchTab('article')}>
          📚 記事
        </button>
        <button className={tab === 'community' ? 'active' : ''} onClick={() => switchTab('community')}>
          🌐 コミュニティ
        </button>
        <button className={tab === 'post' ? 'active' : ''} onClick={() => switchTab('post')}>
          💬 SNS 投稿
        </button>
      </div>

      {loading ? (
        <div className="loading">検索中…</div>
      ) : items === null ? (
        <div className="empty">キーワードを入力して検索してください</div>
      ) : items.length === 0 ? (
        <div className="empty">該当する{labelOf(tab)}は見つかりませんでした</div>
      ) : (
        <div className="search-results">
          {items.map((it) => renderItem(tab, it))}
        </div>
      )}
    </div>
  );
}

function labelOf(t: Tab): string {
  return t === 'article' ? '記事' : t === 'community' ? 'コミュニティ' : 'SNS 投稿';
}

function renderItem(tab: Tab, it: any) {
  if (tab === 'article') {
    return (
      <Link key={it.id} to={`/articles/${it.id}`} className="article-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="article-emoji">{it.emoji || '📝'}</div>
        <div className="article-meta">
          <div className="article-title">{it.title}</div>
          <div className="article-sub">
            <span className={'type-badge ' + it.type}>{it.type === 'idea' ? 'IDEA' : 'TECH'}</span>
            {it.author && <span>by {it.author.name}</span>}
            <span>♥ {it.likeCount || 0}</span>
          </div>
        </div>
      </Link>
    );
  }
  if (tab === 'community') {
    return (
      <Link key={it.id} to={`/communities/${it.id}`} className="article-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="article-emoji">{it.visibility === 'private' ? '🔒' : '🌐'}</div>
        <div className="article-meta">
          <div className="article-title">{it.name}</div>
          <div className="article-sub">
            <span>{it.memberCount} メンバー</span>
            {it.isMember && <span className="badge badge-public">参加中</span>}
          </div>
          {it.description && <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13 }}>{it.description}</div>}
        </div>
      </Link>
    );
  }
  // post
  return (
    <Link key={it.id} to={`/communities/${it.community?.id}`} className="search-post-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar user={{ name: it.author?.name || '?', avatarUrl: it.author?.avatarUrl || null }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <strong>{it.author?.name}</strong>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>in {it.community?.name}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {(it.body || '').slice(0, 240)}
            {(it.body || '').length > 240 ? '…' : ''}
          </div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            ❤ {it.likeCount} · 💬 {it.commentCount}
          </div>
        </div>
      </div>
    </Link>
  );
}
