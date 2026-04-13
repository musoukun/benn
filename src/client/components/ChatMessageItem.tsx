import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { ReactionBar } from './ReactionBar';
import { ReactionPicker } from './ReactionPicker';
import { MentionText } from './MentionText';
import type { ChatMessage } from '../types';
import { getRecentEmoji, addRecentEmoji } from '../hooks/useRecentEmoji';
import { hasMentionForMe } from '../utils/mention';
import { SmilePlus, Reply, Copy, Pin, Forward, Pencil, Trash2, MessageSquare } from 'lucide-react';

type Props = {
  message: ChatMessage;
  grouped: boolean;
  myUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: ChatMessage) => void;
  onPin?: (messageId: string) => void;
  onForward?: (message: ChatMessage) => void;
  onOpenThread?: (messageId: string) => void;
};

export function ChatMessageItem({
  message, grouped, myUserId, onToggleReaction,
  onEdit, onDelete, onReply, onPin, onForward, onOpenThread,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [hovered, setHovered] = useState(false);

  // --- システムメッセージ ---
  if (message.type === 'system' || message.type === 'meet') {
    return (
      <div className="dc-msg-system">
        <span>{message.body}</span>
      </div>
    );
  }

  const ts = new Date(message.createdAt);
  const timeStr = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;
  const fullDate = `${ts.getFullYear()}/${(ts.getMonth() + 1).toString().padStart(2, '0')}/${ts.getDate().toString().padStart(2, '0')} ${timeStr}`;

  const handleSaveEdit = () => {
    if (editBody.trim() && onEdit) onEdit(message.id, editBody.trim());
    setEditing(false);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(message.body);
  };

  // メンション + ピン留め の両方を反映したクラス名
  const mentioned = myUserId && hasMentionForMe(message.body, myUserId);
  const msgClass = `dc-msg${grouped ? ' dc-msg-grouped' : ''}${message.pinnedAt ? ' dc-msg-pinned' : ''}${mentioned ? ' dc-msg-mentioned' : ''}`;

  return (
    <div
      className={msgClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 返信元の引用表示 */}
      {message.parentMessage && !grouped && (
        <div className="dc-msg-reply-quote" onClick={() => onOpenThread?.(message.parentMessage!.id)}>
          <div className="dc-msg-reply-bar" />
          <Avatar user={message.parentMessage.author} size={16} />
          <span className="dc-msg-reply-author">{message.parentMessage.author.name}</span>
          <span className="dc-msg-reply-text">{message.parentMessage.body.slice(0, 100)}</span>
        </div>
      )}

      {/* アバター列 */}
      <div className="dc-msg-gutter">
        {grouped ? (
          <span className="dc-msg-time-inline" title={fullDate}>
            {hovered ? timeStr : ''}
          </span>
        ) : (
          <Link to={`/users/${message.authorId}`} className="dc-msg-avatar">
            <Avatar user={message.author} size={40} />
          </Link>
        )}
      </div>

      {/* 本文列 */}
      <div className="dc-msg-body">
        {/* ピン留めバッジ */}
        {message.pinnedAt && !grouped && (
          <div className="dc-msg-pin-badge"><Pin size={12} /> ピン留め</div>
        )}
        {!grouped && (
          <div className="dc-msg-header">
            <Link to={`/users/${message.authorId}`} className="dc-msg-author">
              {message.author.name}
            </Link>
            <time className="dc-msg-timestamp" title={fullDate}>{fullDate}</time>
          </div>
        )}

        {/* メッセージ本文 */}
        {editing ? (
          <div className="dc-msg-edit">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={2}
              autoFocus
            />
            <div className="dc-msg-edit-hint">
              Escape でキャンセル・Enter で保存
            </div>
          </div>
        ) : (
          <div className="dc-msg-text">
            <MentionText text={message.body} />
          </div>
        )}
        {!editing && message.editedAt && <span className="dc-msg-edited">(編集済)</span>}

        {/* スレッドリンク */}
        {message.replyCount > 0 && (
          <button className="dc-msg-thread-link" onClick={() => onOpenThread?.(message.id)}>
            <MessageSquare size={14} /> {message.replyCount}件の返信
          </button>
        )}

        {/* リアクション */}
        <ReactionBar
          reactions={message.reactions}
          onToggle={(emoji) => onToggleReaction(message.id, emoji)}
        />
        {showPicker && (
          <ReactionPicker
            onSelect={(emoji) => onToggleReaction(message.id, emoji)}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      {/* ホバー時のアクションバー */}
      {hovered && !editing && (
        <div className="dc-msg-actions">
          {getRecentEmoji().map((e) => (
            <button key={e} title={e} onClick={() => { addRecentEmoji(e); onToggleReaction(message.id, e); }}>{e}</button>
          ))}
          <span className="dc-msg-actions-sep" />
          <button title="リアクションを追加" onClick={() => setShowPicker(true)}><SmilePlus size={16} /></button>
          {onReply && <button title="返信" onClick={() => onReply(message)}><Reply size={16} /></button>}
          <button title="テキストをコピー" onClick={handleCopyText}><Copy size={16} /></button>
          {onPin && <button title={message.pinnedAt ? 'ピン留め解除' : 'ピン留め'} onClick={() => onPin(message.id)}><Pin size={16} /></button>}
          {onForward && <button title="転送" onClick={() => onForward(message)}><Forward size={16} /></button>}
          {onEdit && <button title="編集" onClick={() => { setEditing(true); setEditBody(message.body); }}><Pencil size={16} /></button>}
          {onDelete && <button title="削除" onClick={() => onDelete(message.id)}><Trash2 size={16} /></button>}
        </div>
      )}
    </div>
  );
}

/** 日付区切り線コンポーネント */
export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="dc-date-sep">
      <span>{date}</span>
    </div>
  );
}
