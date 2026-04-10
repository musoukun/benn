import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Avatar } from './Avatar';
import type { CommunityFull } from '../types';

// Owner がコミュニティに任意のユーザを直接追加するための UI。
// - 検索 input → 候補リスト
// - 候補をクリックすると下の「追加予定」chip 列に積まれる
// - chip の右上 × で取り消せる
// - 「確定して追加」ボタンで一括 API 送信 (sequential)

type Picked = { id: string; name: string; avatarUrl: string | null };

export function CommunityMemberPicker({
  community,
  onAdded,
}: {
  community: CommunityFull;
  onAdded: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // 既にメンバーの id セット (既存メンバーは候補から除外)
  const existingMemberIds = new Set(community.members.map((m) => m.id));

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await api.searchUsers(q.trim());
        setResults(r.items);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const pick = (u: Picked) => {
    if (picked.find((p) => p.id === u.id)) return;
    setPicked([...picked, u]);
  };
  const unpick = (id: string) => setPicked(picked.filter((p) => p.id !== id));

  const submit = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setMsg(null);
    let added = 0;
    let failed = 0;
    for (const u of picked) {
      try {
        await api.addMember(community.id, u.id);
        added++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setPicked([]);
    setQ('');
    setResults([]);
    setMsg(`${added} 名を追加しました${failed > 0 ? ` (${failed} 名失敗)` : ''}`);
    onAdded();
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>メンバーを直接追加</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        ユーザを検索して、コミュニティに直接追加できます。招待リンクを送る代わりに使えます。
      </p>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="名前またはメールで検索…"
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          marginBottom: 12,
        }}
      />

      {/* 検索結果リスト */}
      {q.trim() && (
        <div
          style={{
            maxHeight: 240,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--muted)', fontSize: 14 }}>
              該当ユーザがいません
            </div>
          ) : (
            results.map((u) => {
              const already = existingMemberIds.has(u.id);
              const isPicked = !!picked.find((p) => p.id === u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => !already && !isPicked && pick(u)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    cursor: already || isPicked ? 'not-allowed' : 'pointer',
                    opacity: already || isPicked ? 0.5 : 1,
                  }}
                >
                  <Avatar user={u} />
                  <span style={{ flex: 1 }}>{u.name}</span>
                  {already && <span style={{ color: 'var(--muted)', fontSize: 13 }}>既メンバー</span>}
                  {!already && isPicked && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>追加予定</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 追加予定の chip 列 */}
      {picked.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
            追加予定 ({picked.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {picked.map((u) => (
              <div
                key={u.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 12px 4px 4px',
                  background: 'var(--accent-soft-20)',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                }}
                title={u.name}
              >
                <Avatar user={u} />
                <span style={{ fontSize: 14, fontWeight: 600, paddingRight: 14 }}>{u.name}</span>
                <button
                  type="button"
                  onClick={() => unpick(u.id)}
                  aria-label={`${u.name} を取り消す`}
                  className="picker-chip-x"
                  title="取り消す"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn" disabled={busy || picked.length === 0} onClick={submit}>
        {busy ? '追加中…' : `${picked.length} 名を追加`}
      </button>

      {msg && <div style={{ marginTop: 12, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}
