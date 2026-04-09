import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { renderMd } from '../markdown';
import { Avatar } from './Avatar';
import type { Comment } from '../types';

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

// 親→子の1段だけインデント、孫以降は子と同列でフラットに繋がる仕様。
// サーバはフラット配列を返すので、ここで木構造に並べ替える。
type Tree = { node: Comment; children: Comment[] };

function buildTree(comments: Comment[]): Tree[] {
  // トップレベル (parentCommentId なし)
  const tops = comments.filter((c) => !c.parentCommentId);
  // top の子と「top の子の子孫」(ぜんぶ親 top に集約。1段平坦)
  const tree: Tree[] = tops.map((t) => ({ node: t, children: [] }));
  const topIds = new Set(tops.map((t) => t.id));
  const indexById = new Map(comments.map((c) => [c.id, c] as const));

  // 各非トップコメントを「自分の親祖先で最初に top にぶつかった id」 (=ルート) に紐付ける
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    let cursor: Comment | undefined = c;
    let rootId: string | null = null;
    while (cursor && cursor.parentCommentId) {
      if (topIds.has(cursor.parentCommentId)) {
        rootId = cursor.parentCommentId;
        break;
      }
      cursor = indexById.get(cursor.parentCommentId);
    }
    if (rootId) {
      const t = tree.find((x) => x.node.id === rootId);
      if (t) t.children.push(c);
    }
  }
  // children を時系列にソート (createdAt asc)
  for (const t of tree) {
    t.children.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }
  return tree;
}

export function CommentSection({
  articleId,
  postId,
  meId,
}: {
  articleId?: string;
  postId?: string;
  meId: string | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    api.listComments(articleId ? { articleId } : { postId }).then((r) => {
      setComments(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, postId]);

  const onPosted = (c: Comment) => setComments((prev) => [...prev, c]);
  const onUpdated = (c: Comment) =>
    setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  const onDeleted = (id: string) =>
    setComments((prev) => prev.filter((x) => x.id !== id));

  const tree = buildTree(comments);

  return (
    <section className="comment-section">
      <h3 className="comment-section-title">💬 コメント ({comments.length})</h3>
      {loading ? (
        <div className="loading">…</div>
      ) : tree.length === 0 ? (
        <div className="empty">まだコメントはありません。最初のコメントを残してみよう。</div>
      ) : (
        <ul className="comment-tree">
          {tree.map((t) => (
            <li key={t.node.id}>
              <CommentRow
                comment={t.node}
                onPosted={onPosted}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
                articleId={articleId}
                postId={postId}
                meId={meId}
              />
              {t.children.length > 0 && (
                <ul className="comment-replies">
                  {t.children.map((child) => (
                    <li key={child.id}>
                      <CommentRow
                        comment={child}
                        // 子の中にいる時の「返信」 onPosted は親 (top) を指す
                        onPosted={onPosted}
                        onUpdated={onUpdated}
                        onDeleted={onDeleted}
                        articleId={articleId}
                        postId={postId}
                        meId={meId}
                        replyTargetId={t.node.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* 新規コメント (トップレベル) */}
      {meId && (
        <CommentComposer
          placeholder="コメントを書く"
          articleId={articleId}
          postId={postId}
          onPosted={onPosted}
        />
      )}
    </section>
  );
}

function CommentRow({
  comment,
  onPosted,
  onUpdated,
  onDeleted,
  articleId,
  postId,
  meId,
  replyTargetId,
}: {
  comment: Comment;
  onPosted: (c: Comment) => void;
  onUpdated: (c: Comment) => void;
  onDeleted: (id: string) => void;
  articleId?: string;
  postId?: string;
  meId: string | null;
  replyTargetId?: string; // 返信ボタンを押したときに親 として渡す comment id
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const r = await api.updateComment(comment.id, editBody);
      onUpdated(r);
      setEditing(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm('このコメントを削除しますか？')) return;
    await api.deleteComment(comment.id);
    onDeleted(comment.id);
  };

  return (
    <div className="comment-row">
      <div className="comment-head">
        <Link to={`/users/${comment.author.id}`} className="comment-avatar-link">
          <Avatar user={{ name: comment.author.name, avatarUrl: comment.author.avatarUrl }} />
        </Link>
        <div className="comment-meta">
          <Link to={`/users/${comment.author.id}`} className="comment-author">
            {comment.author.name}
          </Link>
          <span className="comment-time">
            {relativeTime(comment.createdAt)}
            {comment.updatedAt !== comment.createdAt && ' (編集済)'}
          </span>
        </div>
        {comment.isMine && !editing && (
          <div className="comment-row-actions">
            <button className="icon-btn" onClick={() => setEditing(true)} title="編集">
              ✎
            </button>
            <button className="icon-btn icon-btn-danger" onClick={onDelete} title="削除">
              🗑
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="comment-edit">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="comment-edit-actions">
            <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditBody(comment.body); }}>キャンセル</button>
            <button className="btn" disabled={saving} onClick={saveEdit}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : (
        <div className="comment-body md" dangerouslySetInnerHTML={{ __html: renderMd(comment.body) }} />
      )}
      {!editing && meId && (
        <div className="comment-actions">
          <button className="comment-action-btn" onClick={() => setReplying((v) => !v)}>
            💬 返信
          </button>
        </div>
      )}
      {replying && (
        <CommentComposer
          placeholder={`@${comment.author.name} に返信`}
          articleId={articleId}
          postId={postId}
          parentCommentId={replyTargetId || comment.id}
          onPosted={(c) => {
            onPosted(c);
            setReplying(false);
          }}
          onCancel={() => setReplying(false)}
          autoFocus
        />
      )}
    </div>
  );
}

function CommentComposer({
  placeholder,
  articleId,
  postId,
  parentCommentId,
  onPosted,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  articleId?: string;
  postId?: string;
  parentCommentId?: string;
  onPosted: (c: Comment) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const c = await api.createComment({ body: body.trim(), articleId, postId, parentCommentId });
      onPosted(c);
      setBody('');
      setTab('write');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="comment-composer">
      <div className="comment-composer-tabs">
        <button
          className={'tab-btn ' + (tab === 'write' ? 'active' : '')}
          onClick={() => setTab('write')}
        >
          Markdown
        </button>
        <button
          className={'tab-btn ' + (tab === 'preview' ? 'active' : '')}
          onClick={() => setTab('preview')}
        >
          プレビュー
        </button>
      </div>
      {tab === 'write' ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
        />
      ) : (
        <div
          className="comment-body md comment-preview"
          dangerouslySetInnerHTML={{ __html: renderMd(body || '*プレビューはここに表示されます*') }}
        />
      )}
      <div className="comment-composer-foot">
        <span className="post-composer-hint">{body.length} 文字 · Ctrl+Enter で投稿</span>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button className="btn" disabled={posting || !body.trim()} onClick={submit}>
          {posting ? '投稿中…' : '投稿する'}
        </button>
      </div>
    </div>
  );
}
