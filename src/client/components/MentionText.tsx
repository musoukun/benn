import React, { useState, useMemo } from 'react';
import { parseMentions } from '../utils/mention';
import { MiniProfileCard } from './MiniProfileCard';
import MarkdownIt from 'markdown-it';

const md = MarkdownIt({ linkify: true, breaks: true });

type Props = {
  text: string;
};

/**
 * メンション付きメッセージをMarkdownレンダリングする。
 * メンション部分 @[name](id) はインタラクティブなスパンとして表示。
 * それ以外のテキストは markdown-it でHTMLに変換。
 */
export function MentionText({ text }: Props) {
  const [profilePopup, setProfilePopup] = useState<{ userId: string; top: number; left: number } | null>(null);

  const tokens = parseMentions(text);
  const hasMention = tokens.some((t) => t.type === 'mention');

  const handleMentionClick = (e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (userId === 'everyone') return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setProfilePopup({ userId, top: rect.bottom + 4, left: rect.left });
  };

  // メンション無し → 純粋なMarkdown
  if (!hasMention) {
    const html = useMemo(() => md.render(text), [text]);
    return <span className="dc-msg-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // メンションあり → テキスト部分はMarkdownレンダリング、メンション部分はReactコンポーネント
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          // テキスト部分をMarkdownレンダリング（インラインのみ）
          const html = md.renderInline(token.value);
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
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
