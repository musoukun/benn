import React, { useState } from 'react';
import { parseMentions } from '../utils/mention';
import { MiniProfileCard } from './MiniProfileCard';

type Props = {
  text: string;
};

export function MentionText({ text }: Props) {
  const [profilePopup, setProfilePopup] = useState<{ userId: string; top: number; left: number } | null>(null);

  const tokens = parseMentions(text);

  // メンションが無い場合はそのまま返す
  const hasMention = tokens.some((t) => t.type === 'mention');
  if (!hasMention) return <>{text}</>;

  const handleMentionClick = (e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (userId === 'everyone') return; // everyone はポップアップ無し
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setProfilePopup({ userId, top: rect.bottom + 4, left: rect.left });
  };

  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'text') return <span key={i}>{token.value}</span>;
        const isEveryone = token.userId === 'everyone';
        return (
          <span
            key={i}
            className={`mention-inline${isEveryone ? ' mention-everyone' : ''}`}
            onClick={(e) => handleMentionClick(e, token.userId)}
            role="button"
            tabIndex={0}
          >
            @{token.displayName}
          </span>
        );
      })}
      {profilePopup && (
        <MiniProfileCard
          userId={profilePopup.userId}
          position={{ top: profilePopup.top, left: profilePopup.left }}
          onClose={() => setProfilePopup(null)}
        />
      )}
    </>
  );
}
