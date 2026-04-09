import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { CommunitySummary } from '../types';

export function CommunitiesPage() {
  const [items, setItems] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [creating, setCreating] = useState(false);

  const reload = () => api.listCommunities().then((r) => { setItems(r); setLoading(false); });
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.createCommunity({ name: name.trim(), description: desc.trim() || undefined, visibility });
      setName('');
      setDesc('');
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="container"><div className="loading">読み込み中…</div></div>;

  const mine = items.filter((c) => c.isMember);
  const others = items.filter((c) => !c.isMember);

  const renderCard = (c: CommunitySummary) => (
    <Link to={`/communities/${c.id}`} key={c.id} className="article-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="article-emoji">{c.visibility === 'private' ? '🔒' : '🌐'}</div>
      <div className="article-meta">
        <div className="article-title">{c.name}</div>
        <div className="article-sub">
          <span>{c.memberCount} メンバー</span>
          {c.isMember && <span className={`badge ${c.visibility === 'private' ? 'badge-private' : 'badge-public'}`}>参加中</span>}
        </div>
        {c.description && <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 15 }}>{c.description}</div>}
      </div>
    </Link>
  );

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>コミュニティ</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>新しいコミュニティを作る</h3>
        <input
          type="text"
          placeholder="コミュニティ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }}
        />
        <textarea
          placeholder="説明 (任意)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', minHeight: 60, marginBottom: 8 }}
        />
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 15, marginRight: 8, fontWeight: 600 }}>公開範囲:</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
          >
            <option value="private">🔒 限定 (招待リンクのみ)</option>
            <option value="public">🌐 公開 (誰でも一覧から見つけられる)</option>
          </select>
        </div>
        <button className="btn" disabled={creating} onClick={create}>
          {creating ? '作成中…' : '作成'}
        </button>
      </div>

      <h3 style={{ marginTop: 24 }}>あなたが参加中 ({mine.length})</h3>
      {mine.length === 0 ? (
        <div className="empty">まだ参加しているコミュニティがありません</div>
      ) : (
        mine.map(renderCard)
      )}

      <h3 style={{ marginTop: 32 }}>公開コミュニティ ({others.length})</h3>
      {others.length === 0 ? (
        <div className="empty">公開コミュニティはまだありません</div>
      ) : (
        others.map(renderCard)
      )}
    </div>
  );
}
