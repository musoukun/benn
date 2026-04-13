import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { connectSocket } from '../socket';
import { useChatRoom } from '../hooks/useChatRoom';
import { ChatMessageItem, DateSeparator } from '../components/ChatMessageItem';
import { Avatar } from '../components/Avatar';
import { useMe } from '../useMe';
import type { ChatRoomFull, ChatMessage, ChatRoomSummary } from '../types';

export function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoomFull | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 返信先
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // スレッドペイン
  const [threadMessageId, setThreadMessageId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<{ parent: ChatMessage; replies: ChatMessage[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadInput, setThreadInput] = useState('');

  // 転送モーダル
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardRooms, setForwardRooms] = useState<ChatRoomSummary[]>([]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardComment, setForwardComment] = useState('');

  useEffect(() => { connectSocket(); }, []);

  // チャット画面ではbodyスクロールを無効化
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const {
    messages, typingUsers, loading, hasMore,
    sendMessage, editMessage, deleteMessage, sendTyping, toggleReaction,
    pinMessage, forwardMessage, loadMore,
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

  // スレッド読み込み
  useEffect(() => {
    if (!threadMessageId || !id) {
      setThreadData(null);
      return;
    }
    setThreadLoading(true);
    api.getChatThread(id, threadMessageId).then((data) => {
      setThreadData(data);
      setThreadLoading(false);
    }).catch(() => setThreadLoading(false));
  }, [threadMessageId, id]);

  // 転送モーダルを開いたときにルーム一覧を取得
  useEffect(() => {
    if (!forwardingMessage) return;
    api.listChatRooms().then(setForwardRooms);
  }, [forwardingMessage]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendMessage(trimmed, replyingTo?.id);
    setInputValue('');
    setReplyingTo(null);
    sendTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
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

  const handleForwardSend = (targetRoomId: string) => {
    if (!forwardingMessage) return;
    forwardMessage(forwardingMessage.id, targetRoomId, forwardComment || undefined);
    setForwardingMessage(null);
    setForwardComment('');
    setForwardSearch('');
    setToast('転送しました');
  };

  // スレッドへの返信送信
  const handleThreadSend = () => {
    const trimmed = threadInput.trim();
    if (!trimmed || !threadMessageId) return;
    sendMessage(trimmed, threadMessageId);
    setThreadInput('');
    // スレッドを再読み込み
    setTimeout(() => {
      if (id && threadMessageId) {
        api.getChatThread(id, threadMessageId).then(setThreadData);
      }
    }, 500);
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

      if (dateStr !== lastDate) {
        elements.push(<DateSeparator key={`date-${dateStr}`} date={dateStr} />);
        lastDate = dateStr;
        lastAuthorId = '';
        lastTime = 0;
      }

      const grouped =
        msg.type === 'user' &&
        msg.authorId === lastAuthorId &&
        ts.getTime() - lastTime < 5 * 60 * 1000 &&
        !msg.parentMessage;  // 返信メッセージはグルーピングしない

      elements.push(
        <ChatMessageItem
          key={msg.id}
          message={msg}
          grouped={grouped}
          onToggleReaction={toggleReaction}
          onEdit={msg.isMine ? editMessage : undefined}
          onDelete={msg.isMine || isOwner ? deleteMessage : undefined}
          onReply={(m) => setReplyingTo(m)}
          onPin={pinMessage}
          onForward={(m) => setForwardingMessage(m)}
          onOpenThread={(msgId) => setThreadMessageId(msgId)}
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

  // 転送モーダル用: フィルタされたルーム
  const filteredForwardRooms = forwardRooms.filter(
    (r) => r.id !== id && r.name.toLowerCase().includes(forwardSearch.toLowerCase())
  );

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

          {/* 返信プレビュー */}
          {replyingTo && (
            <div className="dc-reply-preview">
              <div className="dc-reply-preview-bar" />
              <span className="dc-reply-preview-label">↩️ {replyingTo.author.name} に返信</span>
              <span className="dc-reply-preview-text">{replyingTo.body.slice(0, 80)}</span>
              <button className="dc-reply-preview-close" onClick={() => setReplyingTo(null)}>✕</button>
            </div>
          )}

          {/* 入力 */}
          <div className="dc-input-area">
            <textarea
              className="dc-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyingTo ? `${replyingTo.author.name} に返信...` : `#${room.name} へメッセージを送信`}
              rows={1}
            />
          </div>
        </div>

        {/* ===== スレッドペイン ===== */}
        {threadMessageId && (
          <aside className="dc-thread-pane">
            <div className="dc-thread-header">
              <h3>スレッド</h3>
              <button className="dc-thread-close" onClick={() => { setThreadMessageId(null); setThreadData(null); }}>✕</button>
            </div>
            <div className="dc-thread-messages">
              {threadLoading && <p className="dc-loading">読み込み中...</p>}
              {threadData && (
                <>
                  {/* 親メッセージ */}
                  <ChatMessageItem
                    key={threadData.parent.id}
                    message={threadData.parent}
                    grouped={false}
                    onToggleReaction={toggleReaction}
                    onEdit={threadData.parent.isMine ? editMessage : undefined}
                    onDelete={threadData.parent.isMine || isOwner ? deleteMessage : undefined}
                  />
                  <div className="dc-thread-divider">
                    <span>{threadData.replies.length}件の返信</span>
                  </div>
                  {/* 返信一覧 */}
                  {threadData.replies.map((reply) => (
                    <ChatMessageItem
                      key={reply.id}
                      message={reply}
                      grouped={false}
                      onToggleReaction={toggleReaction}
                      onEdit={reply.isMine ? editMessage : undefined}
                      onDelete={reply.isMine || isOwner ? deleteMessage : undefined}
                    />
                  ))}
                </>
              )}
            </div>
            {/* スレッド入力 */}
            <div className="dc-thread-input-area">
              <textarea
                className="dc-input"
                value={threadInput}
                onChange={(e) => setThreadInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleThreadSend(); }
                }}
                placeholder="スレッドに返信..."
                rows={1}
              />
            </div>
          </aside>
        )}

        {/* ===== 右サイドバー: メンバー一覧 (スレッドペインが開いてないときのみ) ===== */}
        {showMembers && !threadMessageId && (
          <aside className="dc-sidebar">
            <h3 className="dc-sidebar-title">メンバー — {room.members.length}</h3>
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

      {/* ===== 転送モーダル ===== */}
      {forwardingMessage && (
        <div className="dc-modal-overlay" onClick={() => setForwardingMessage(null)}>
          <div className="dc-forward-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-forward-header">
              <h3>転送先</h3>
              <button className="dc-forward-close" onClick={() => setForwardingMessage(null)}>✕</button>
            </div>
            <p className="dc-forward-desc">このメッセージを共有する場所を選んでください。</p>

            <input
              className="dc-forward-search"
              type="text"
              placeholder="🔍 検索"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
            />

            <div className="dc-forward-list">
              {filteredForwardRooms.map((r) => (
                <button
                  key={r.id}
                  className="dc-forward-room"
                  onClick={() => handleForwardSend(r.id)}
                >
                  <span className="dc-forward-room-emoji">{r.emoji || '#'}</span>
                  <div className="dc-forward-room-info">
                    <span className="dc-forward-room-name">{r.name}</span>
                    {r.description && <span className="dc-forward-room-desc">{r.description}</span>}
                  </div>
                </button>
              ))}
              {filteredForwardRooms.length === 0 && (
                <p className="dc-forward-empty">ルームが見つかりません</p>
              )}
            </div>

            {/* 転送元メッセージプレビュー */}
            <div className="dc-forward-preview">
              <span className="dc-forward-preview-body">{forwardingMessage.body.slice(0, 100)}</span>
            </div>

            <div className="dc-forward-footer">
              <input
                className="dc-forward-comment"
                type="text"
                placeholder="オプションのメッセージを追加..."
                value={forwardComment}
                onChange={(e) => setForwardComment(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
