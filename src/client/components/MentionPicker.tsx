import React, { useEffect, useRef } from 'react';
import { Avatar } from './Avatar';
import type { ChatRoomMember } from '../types';

type Props = {
  members: ChatRoomMember[];
  query: string;
  selectedIndex: number;
  onSelect: (name: string, userId: string) => void;
  onHover: (index: number) => void;
  onClose: () => void;
};

export function MentionPicker({ members, query, selectedIndex, onSelect, onHover, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const candidates = getMentionCandidates(members, query);
  const visible = candidates.slice(0, 15);

  useEffect(() => {
    // +1 はヘッダー行分
    const el = listRef.current?.children[selectedIndex + 1] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (visible.length === 0) return null;

  return (
    <div className="mention-picker" ref={listRef}>
      <div className="mention-picker-header">メンバー</div>
      {visible.map((c, i) => (
        <button
          key={c.id}
          className={`mention-picker-item${i === selectedIndex ? ' selected' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(c.name, c.id); }}
          onMouseEnter={() => onHover(i)}
        >
          <div className="mention-picker-avatar">
            {c.id === 'everyone' ? (
              <span className="mention-picker-everyone-icon">@</span>
            ) : (
              <Avatar user={{ name: c.name, avatarUrl: c.avatarUrl }} size={24} />
            )}
          </div>
          <span className="mention-picker-name">{c.name}</span>
          {c.desc && <span className="mention-picker-desc">{c.desc}</span>}
        </button>
      ))}
    </div>
  );
}

/** メンション候補を返す (ChatRoomPage と共有) */
export type MentionCandidate = { id: string; name: string; avatarUrl: string | null; desc?: string };

export function getMentionCandidates(members: ChatRoomMember[], query: string): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];
  const q = query.toLowerCase();
  if ('everyone'.startsWith(q)) {
    candidates.push({ id: 'everyone', name: 'everyone', avatarUrl: null, desc: 'ルーム全員に通知します' });
  }
  for (const m of members) {
    if (m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) {
      candidates.push({ id: m.id, name: m.name, avatarUrl: m.avatarUrl });
    }
  }
  return candidates.slice(0, 15);
}
