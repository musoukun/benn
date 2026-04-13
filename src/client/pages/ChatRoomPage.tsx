import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { connectSocket } from '../socket';
import { useChatRoom } from '../hooks/useChatRoom';
import { ChatMessageItem, DateSeparator } from '../components/ChatMessageItem';
import { MentionPicker, getMentionCandidates } from '../components/MentionPicker';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import { buildMention } from '../utils/mention';
import type { ChatRoomFull } from '../types';

export function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoomFull | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { connectSocket(); }, []);

  // チャット画面ではbodyスクロールを無効化
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const {
    messages, typingUsers, loading, hasMore,
    sendMessage, editMessage, deleteMessage, sendTyping, toggleReaction, loadMore,
  } = useChatRoom(id!);

  useEffect(() => {
    if (!id) return;
    api.getChatRoom(id).then(setRoom).catch(() => nav('/chat'));
  }, [id, nav]);

  // 新着メッセージで自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // --- メンション候補計算 ---
  const mentionCandidates = (mentionQuery !== null && room)
    ? getMentionCandidates(room.members, mentionQuery)
    : [];

  // メンション選択
  const handleMentionSelect = useCallback((name: string, userId: string) => {
    const before = inputValue.slice(0, mentionStart);
    const after = inputValue.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const mention = buildMention(name, userId);
    setInputValue(before + mention + ' ' + after);
    setMentionQuery(null);
    setMentionStart(-1);
    setMentionIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [inputValue, mentionStart, mentionQuery]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInputValue('');
    setMentionQuery(null);
    setMentionStart(-1);
    sendTyping(false);
  };

  // テキストエリアの入力変更 → メンションクエリ検出
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const pos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, pos);
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx >= 0) {
      const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : ' ';
      const query = textBefore.slice(atIdx + 1);
      if ((charBefore === ' ' || charBefore === '\n' || atIdx === 0) && !/\s/.test(query)) {
        setMentionQuery(query);
        setMentionStart(atIdx);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStart(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // メンションピッカーが表示中はキーボード操作をハイジャック
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionCandidates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const c = mentionCandidates[mentionIndex];
        if (c) handleMentionSelect(c.name, c.id);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setMentionStart(-1);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2000);
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop === 0) loadMore();
  };

  const handleLeave = async () => {
    if (!me || !id) return;
    if (!confirm('このルームから退出しますか？')) return;
    try {
      await api.removeChatRoomMember(id, me.id);
      nav('/chat');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  if (!room) return <main className="dc-layout"><div className="dc-center"><p className="dc-loading">読み込み中...</p></div></main>;

  const isOwner = room.myRole === 'owner';

  // メッセージを日付区切り + グルーピング付きで表示
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];
    let lastDate = '';
    let lastAuthorId = '';
    let lastTime = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const ts = new Date(msg.createdAt);
      const dateStr = `${ts.getFullYear()}年${ts.getMonth() + 1}月${ts.getDate()}日`;

      // 日付区切り
      if (dateStr !== lastDate) {
        elements.push(<DateSeparator key={`date-${dateStr}`} date={dateStr} />);
        lastDate = dateStr;
        lastAuthorId = '';
        lastTime = 0;
      }

      // グルーピング: 同一著者 & 5分以内 & 通常メッセージ
      const grouped =
        msg.type === 'user' &&
        msg.authorId === lastAuthorId &&
        ts.getTime() - lastTime < 5 * 60 * 1000;

      elements.push(
        <ChatMessageItem
          key={msg.id}
          message={msg}
          grouped={grouped}
          myUserId={me?.id}
          onToggleReaction={toggleReaction}
          onEdit={msg.isMine ? editMessage : undefined}
          onDelete={msg.isMine || isOwner ? deleteMessage : undefined}
        />
      );

      if (msg.type === 'user') {
        lastAuthorId = msg.authorId;
        lastTime = ts.getTime();
      } else {
        lastAuthorId = '';
        lastTime = 0;
      }
    }
    return elements;
  };

  return (
    <div className="dc-layout">
      {/* ===== ヘッダー ===== */}
      <div className="dc-topbar">
        <Link to="/chat" className="dc-topbar-back" title="ルーム一覧">←</Link>
        <span className="dc-topbar-hash">#</span>
        <span className="dc-topbar-name">{room.name}</span>
        {room.description && (
          <>
            <span className="dc-topbar-divider" />
            <span className="dc-topbar-desc">{room.description}</span>
          </>
        )}
        <div className="dc-topbar-right">
          <button
            className={`dc-topbar-btn${showMembers ? ' active' : ''}`}
            onClick={() => setShowMembers((v) => !v)}
            title="メンバーリスト"
          >
            👥
          </button>
          {isOwner && (
            <Link to={`/chat/${id}/settings`} className="dc-topbar-btn" title="設定">
              ⚙
            </Link>
          )}
          <button className="dc-topbar-btn" onClick={handleLeave} title="退出">
            🚪
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="dc-main">
        {/* ===== メッセージエリア ===== */}
        <div className="dc-center">
          <div className="dc-messages" ref={messagesContainerRef} onScroll={handleScroll}>
            {hasMore && (
              <button className="dc-load-more" onClick={loadMore}>過去のメッセージを読み込む</button>
            )}
            {loading && <p className="dc-loading">読み込み中...</p>}
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>

          {/* タイピング */}
          <div className="dc-typing-area">
            {typingUsers.length > 0 && (
              <span className="dc-typing">
                <span className="dc-typing-dots" />
                {typingUsers.map((u) => u.userName).join(', ')} が入力中...
              </span>
            )}
          </div>

          {/* 入力 */}
          <div className="dc-input-area">
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <MentionPicker
                members={room.members}
                query={mentionQuery}
                selectedIndex={mentionIndex}
                onSelect={handleMentionSelect}
                onHover={(i) => setMentionIndex(i)}
                onClose={() => { setMentionQuery(null); setMentionStart(-1); }}
              />
            )}
            <textarea
              ref={inputRef}
              className="dc-input"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`#${room.name} へメッセージを送信`}
              rows={1}
            />
          </div>
        </div>

        {/* ===== 右サイドバー: メンバー一覧 ===== */}
        {showMembers && (
          <aside className="dc-sidebar">
            <h3 className="dc-sidebar-title">メンバー — {room.members.length}</h3>
            {/* 管理者 */}
            {room.members.filter((m) => m.role === 'owner').length > 0 && (
              <>
                <div className="dc-sidebar-section">管理者 — {room.members.filter((m) => m.role === 'owner').length}</div>
                {room.members.filter((m) => m.role === 'owner').map((m) => (
                  <Link to={`/users/${m.id}`} key={m.id} className="dc-member">
                    <Avatar user={m} size={32} />
                    <span className="dc-member-name">{m.name}</span>
                  </Link>
                ))}
              </>
            )}
            {/* メンバー */}
            {room.members.filter((m) => m.role === 'member').length > 0 && (
              <>
                <div className="dc-sidebar-section">メンバー — {room.members.filter((m) => m.role === 'member').length}</div>
                {room.members.filter((m) => m.role === 'member').map((m) => (
                  <Link to={`/users/${m.id}`} key={m.id} className="dc-member">
                    <Avatar user={m} size={32} />
                    <span className="dc-member-name">{m.name}</span>
                  </Link>
                ))}
              </>
            )}
          </aside>
        )}
      </div>

    </div>
  );
}
