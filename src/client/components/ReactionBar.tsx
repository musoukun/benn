import React, { useState } from 'react';
import type { ReactionGroup } from '../types';

type Props = {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
};

export function ReactionBar({ reactions, onToggle }: Props) {
  if (reactions.length === 0) return null;

  return (
    <div className="reaction-bar">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          className={`reaction-pill${r.reacted ? ' reacted' : ''}`}
          onClick={() => onToggle(r.emoji)}
          title={r.userNames.join(', ')}
        >
          <span className="reaction-emoji">{r.emoji}</span>
          <span className="reaction-count">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
