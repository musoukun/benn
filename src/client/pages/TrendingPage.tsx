import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleListItem } from '../types';
import { ArticleCard } from '../components/ArticleCard';

function TrendingSection({ type, label, emoji }: { type: 'howto' | 'diary'; label: string; emoji: string }) {
  const [items, setItems] = useState<ArticleListItem[] | null>(null);

  useEffect(() => {
    api
      .trending(type)
      .then((r) => setItems(r.items || []))
      .catch(() => setItems([]));
  }, [type]);

  return (
    <section style={{ marginBottom: 40 }}>
      <h3 style={{ fontSize: 20, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {emoji} {label}
      </h3>
      {items === null ? (
        <div className="loading">…</div>
      ) : items.length === 0 ? (
        <div className="empty" style={{ fontSize: 14 }}>
          まだいいねが付いた記事がありません
        </div>
      ) : (
        <div className="articles-grid">
          {items.map((a) => <ArticleCard key={a.id} a={a} />)}
        </div>
      )}
    </section>
  );
}

export function TrendingPage() {
  const [days, setDays] = useState<number>(30);

  useEffect(() => {
    api.trending('howto').then((r) => { if (r.days) setDays(r.days); });
  }, []);

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>🔥 Trending</h2>
      <div style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 24 }}>
        過去 {days} 日間のいいね数で集計しています
      </div>
      <TrendingSection type="howto" label="Howto" emoji="📝" />
      <TrendingSection type="diary" label="Diary" emoji="📔" />
    </div>
  );
}
