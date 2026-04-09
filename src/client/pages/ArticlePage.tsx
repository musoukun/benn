import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { AIReview, ArticleFull } from '../types';
import { Avatar } from '../components/Avatar';
import { renderMd } from '../markdown';

export function ArticlePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState<ArticleFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [reviews, setReviews] = useState<AIReview[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.listReviews(id).then(setReviews).catch(() => setReviews([]));
  }, [id]);

  const runReview = useCallback(async () => {
    setReviewing(true);
    try {
      const r = await api.reviewArticle(id);
      setReviews((prev) => [r, ...prev]);
      setShowReviews(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReviewing(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setErrorStatus(null);
    api
      .getArticle(id)
      .then((r) => {
        setA(r);
        setLoading(false);
      })
      .catch((e) => {
        setA(null);
        setErrorStatus(e instanceof ApiError ? e.status : 500);
        setLoading(false);
      });
  }, [id]);

  const onLike = useCallback(() => {
    api.toggleLike(id).then((r) => {
      setA((prev) => (prev ? { ...prev, likedByMe: r.liked, likeCount: r.count } : prev));
    });
  }, [id]);

  const onBookmark = useCallback(() => {
    api.toggleBookmark(id).then((r) => {
      setA((prev) =>
        prev ? { ...prev, bookmarkedByMe: r.bookmarked, bookmarkCount: r.count } : prev
      );
    });
  }, [id]);

  const onFollowAuthor = useCallback(() => {
    if (!a) return;
    api.toggleFollow('user', a.authorId).then((r) => {
      setA((prev) => (prev ? { ...prev, followingAuthor: r.following } : prev));
    });
  }, [a]);

  const onDelete = useCallback(() => {
    if (!confirm('この記事を削除しますか？')) return;
    api.deleteArticle(id).then(() => nav('/'));
  }, [id, nav]);

  if (loading) return <div className="container"><div className="loading">読み込み中…</div></div>;
  if (!a) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          {errorStatus === 403 ? (
            <>
              <h2 style={{ marginTop: 0 }}>🔒 この記事は限定公開です</h2>
              <p style={{ color: 'var(--muted)' }}>
                所属するコミュニティのメンバーまたは特定の所属タグを持つ人だけが閲覧できます。
                記事を投稿した人や、コミュニティの代表者に招待を依頼してください。
              </p>
            </>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>記事が見つかりません</h2>
              <p style={{ color: 'var(--muted)' }}>
                記事が削除されたか、URL が間違っている可能性があります。
              </p>
            </>
          )}
          <Link to="/" className="btn">ホームに戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <article className="article-detail">
        {a.isMine && (
          <Link to={`/editor/${a.id}`} className="article-edit-fab" title="この記事を編集">
            ✎ 編集
          </Link>
        )}
        <div className="article-hero">
          <div className="emoji">{a.emoji || '📝'}</div>
          <h1>{a.title}</h1>
          <div style={{ marginBottom: 8 }}>
            <span className={'type-badge ' + a.type}>{a.type === 'idea' ? 'IDEA' : 'TECH'}</span>
          </div>
          <div className="article-author">
            <Avatar user={a.author} />
            <Link to={`/users/${a.authorId}`}>{a.author ? a.author.name : '匿名'}</Link>
            {!a.isMine && (
              <button
                className={'follow-btn' + (a.followingAuthor ? ' on' : '')}
                onClick={onFollowAuthor}
              >
                {a.followingAuthor ? 'Following' : 'Follow'}
              </button>
            )}
            <span>·</span>
            <span>{(a.publishedAt || a.createdAt || '').slice(0, 10)}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {a.topics?.map((t) => (
              <Link key={t.id} to={`/topics/${t.slug}`} className="tag" style={{ margin: '0 4px' }}>
                {t.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(a.body) }} />
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0' }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button className={'like-btn' + (a.likedByMe ? ' liked' : '')} onClick={onLike}>
            ♥ {a.likeCount || 0}
          </button>
          <button className={'bm-btn' + (a.bookmarkedByMe ? ' on' : '')} onClick={onBookmark}>
            🔖 {a.bookmarkCount || 0}
          </button>
          {a.isMine && (
            <Link to={`/editor/${a.id}`} className="btn btn-ghost">
              編集
            </Link>
          )}
          {a.isMine && (
            <button className="btn btn-danger" onClick={onDelete}>
              削除
            </button>
          )}
          <button className="btn btn-ghost" disabled={reviewing} onClick={runReview}>
            {reviewing ? 'AIレビュー中…' : '🤖 AIレビュー'}
          </button>
          {reviews.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowReviews((v) => !v)}>
              {showReviews ? 'レビューを隠す' : `レビュー${reviews.length}件を表示`}
            </button>
          )}
        </div>

        {showReviews && reviews.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>AIレビュー</h3>
            {reviews.map((rv) => (
              <div key={rv.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
                  {rv.user?.name || 'AI'} · {rv.createdAt?.slice(0, 16).replace('T', ' ')}
                </div>
                <p><strong>講評:</strong> {rv.summary}</p>
                {rv.goodPoints?.length > 0 && (
                  <>
                    <strong>良い点</strong>
                    <ul>{rv.goodPoints.map((g, i) => <li key={i}>{g}</li>)}</ul>
                  </>
                )}
                {rv.improvements?.length > 0 && (
                  <>
                    <strong>改善点</strong>
                    <ul>{rv.improvements.map((g, i) => <li key={i}>{g}</li>)}</ul>
                  </>
                )}
                {rv.lineComments?.length > 0 && (
                  <>
                    <strong>行コメント</strong>
                    {rv.lineComments.map((lc, i) => {
                      const lines = (a?.body || '').split('\n');
                      const target = lines[lc.line - 1] || '';
                      return (
                        <div key={i} style={{ marginTop: 8, padding: 8, background: '#f7fbfc', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>L{lc.line}: {target}</div>
                          <div style={{ marginTop: 4 }}>{lc.body}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
