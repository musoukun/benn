import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleListItem } from '../types';
import { ArticleCard } from '../components/ArticleCard';

export function TrendingPage() {
  const [type, setType] = useState<'tech' | 'idea'>('tech');
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  const [days, setDays] = useState<number>(30);

  useEffect(() => {
    setItems(null);
    api
      .trending(type)
      .then((r) => {
        setItems(r.items || []);
        if (r.days) setDays(r.days);
      })
      .catch(() => setItems([]));
  }, [type]);

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>🔥 Trending</h2>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
        過去 {days} 日間のいいね数で集計しています (サーバ設定)
      </div>
      <div className="tabs">
        <button className={type === 'tech' ? 'active' : ''} onClick={() => setType('tech')}>
          Tech
        </button>
        <button className={type === 'idea' ? 'active' : ''} onClick={() => setType('idea')}>
          Idea
        </button>
      </div>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          まだ {days} 日以内にいいねが付いた記事がありません。
          <br />
          記事を投稿していいねを集めてみよう！
        </div>
      ) : (
        items.map((a) => <ArticleCard key={a.id} a={a} />)
      )}
    </div>
  );
}
