import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { renderMd } from '../markdown';
import { TagInput } from '../components/TagInput';
import { AIReviewSidebar } from '../components/AIReviewSidebar';
import { BotIcon } from '../components/BotIcon';
import { PublishPanel } from '../components/PublishPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Affiliation, CommunitySummary, CommunityFull } from '../types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function EditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📝');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [type, setType] = useState<'howto' | 'diary'>('howto');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  // 拡張: 公開範囲 / 予約 / コミュニティ
  const [visibility, setVisibility] = useState<'public' | 'affiliation_in' | 'affiliation_out'>('public');
  const [visibilityAffIds, setVisibilityAffIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [communityId, setCommunityId] = useState<string>('');
  const [timelineId, setTimelineId] = useState<string>('');
  const [allAffiliations, setAllAffiliations] = useState<Affiliation[]>([]);
  const [myCommunities, setMyCommunities] = useState<CommunitySummary[]>([]);
  const [communityDetail, setCommunityDetail] = useState<CommunityFull | null>(null);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    api.listAffiliations().then(setAllAffiliations).catch(() => {});
    api.listCommunities().then((cs) => setMyCommunities(cs.filter((c) => c.isMember))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!communityId) { setCommunityDetail(null); setTimelineId(''); return; }
    api.getCommunity(communityId).then((c) => {
      setCommunityDetail(c);
      if (c.timelines.length > 0 && !timelineId) setTimelineId(c.timelines[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  // 集約画面からのプリフィル
  useEffect(() => {
    if (search.get('prefill') === '1') {
      const md = sessionStorage.getItem('uchi:editor-prefill');
      if (md) {
        setBody(md);
        sessionStorage.removeItem('uchi:editor-prefill');
      }
    }
  }, [search]);

  // ?communityId=... &timelineId=... のクエリで投稿先を初期化
  // (CommunityPage の「このコミュニティに投稿」ボタン経由)
  useEffect(() => {
    const cid = search.get('communityId');
    const tid = search.get('timelineId');
    if (cid && !id) {
      setCommunityId(cid);
      if (tid) setTimelineId(tid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [uploading, setUploading] = useState(false);
  const [scrollSync, setScrollSync] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('uchi:scrollSync');
    return v === null ? true : v === '1';
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef<'edit' | 'preview' | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('uchi:scrollSync', scrollSync ? '1' : '0');
    }
  }, [scrollSync]);

  // 編集ペイン → プレビュー (相対スクロール位置で同期)
  const onEditorScroll = useCallback(() => {
    if (!scrollSync) return;
    if (syncingRef.current === 'preview') {
      syncingRef.current = null;
      return;
    }
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const max = ta.scrollHeight - ta.clientHeight;
    if (max <= 0) return;
    const ratio = ta.scrollTop / max;
    syncingRef.current = 'edit';
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  }, [scrollSync]);

  const onPreviewScroll = useCallback(() => {
    if (!scrollSync) return;
    if (syncingRef.current === 'edit') {
      syncingRef.current = null;
      return;
    }
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const max = pv.scrollHeight - pv.clientHeight;
    if (max <= 0) return;
    const ratio = pv.scrollTop / max;
    syncingRef.current = 'preview';
    ta.scrollTop = ratio * (ta.scrollHeight - ta.clientHeight);
  }, [scrollSync]);

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setBody((b) => b + snippet);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setBody((b) => b.slice(0, start) + snippet + b.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.selectionStart = ta.selectionEnd = pos;
    });
  }, []);

  const uploadAndInsert = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        alert('ファイルサイズは 50MB までです');
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('画像ファイルのみアップロードできます');
        return;
      }
      setUploading(true);
      try {
        const r = await api.uploadFile(file);
        const alt = file.name.replace(/\.[^.]+$/, '');
        insertAtCursor(`![${alt}](${r.url})\n`);
      } catch (e: any) {
        alert('アップロード失敗: ' + e.message);
      } finally {
        setUploading(false);
      }
    },
    [insertAtCursor]
  );

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.dataTransfer?.files || []);
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (imgs.length === 0) return;
      e.preventDefault();
      for (const f of imgs) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgs = items
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (imgs.length === 0) return;
      e.preventDefault();
      for (const f of imgs) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  useEffect(() => {
    if (!id) return;
    api.getArticle(id).then((a) => {
      if (!a) return;
      setTitle(a.title || '');
      setEmoji(a.emoji || '📝');
      setBody(a.body || '');
      setTopics((a.topics || []).map((t) => t.name));
      setType((a.type as 'howto' | 'diary') || 'howto');
      if (a.visibility) setVisibility(a.visibility);
      if (a.visibilityAffiliationIds)
        setVisibilityAffIds(a.visibilityAffiliationIds.split(',').filter(Boolean));
      if (a.scheduledAt) setScheduledAt(a.scheduledAt.slice(0, 16));
      if (a.communityId) setCommunityId(a.communityId);
      if (a.timelineId) setTimelineId(a.timelineId);
      setLoaded(true);
    });
  }, [id]);

  const save = useCallback(
    async (published: boolean) => {
      if (published) {
        if (!title.trim()) {
          alert('タイトルを入力してください');
          return;
        }
        if (topics.length === 0) {
          alert('トピックを最低1つ入力してください');
          return;
        }
        if (type !== 'howto' && type !== 'diary') {
          alert('カテゴリ (Howto / Diary) を選んでください');
          return;
        }
      }
      setSaving(true);
      const payload: any = {
        title,
        emoji,
        type,
        body,
        topicNames: topics,
        published,
        visibility,
        visibilityAffiliationIds: visibility === 'public' ? [] : visibilityAffIds,
        scheduledAt: scheduledAt || null,
        communityId: communityId || null,
        timelineId: timelineId || null,
      };
      try {
        const a = id
          ? await api.updateArticle(id, payload)
          : await api.createArticle(payload);
        if (published) {
          nav('/articles/' + a.id);
        } else {
          // 新規作成 → URL を /editor/<id> に置き換えて id を流し込む
          // (これをしないと useParams().id が undefined のままで AI添削などが disabled になる)
          if (!id) nav('/editor/' + a.id, { replace: true });
          if (scheduledAt) alert('予約しました: ' + scheduledAt);
          else alert('下書き保存しました');
        }
      } catch (e: any) {
        alert('保存失敗: ' + e.message);
      } finally {
        setSaving(false);
      }
    },
    [id, title, emoji, type, body, topics, nav, visibility, visibilityAffIds, scheduledAt, communityId, timelineId]
  );

  // エディタは画面いっぱいを使うので、ページ全体のスクロールを抑止して
  // 「ページのスクロールバー」と「プレビューペインの内部スクロールバー」が
  // 二重に出るのを防ぐ。
  // また、上部の sticky な .header の分だけエディタの高さが viewport を
  // はみ出して下端が切れる問題があったため、ヘッダの実寸を測って
  // CSS 変数 --header-h に流し込み、editor-page の高さを
  // calc(100dvh - var(--header-h)) で計算する。
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const header = document.querySelector('.header') as HTMLElement | null;
    const setHeaderH = () => {
      const h = header ? header.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty('--header-h', `${h}px`);
    };
    setHeaderH();
    let ro: ResizeObserver | null = null;
    if (header && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(setHeaderH);
      ro.observe(header);
    }
    window.addEventListener('resize', setHeaderH);

    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.documentElement.style.removeProperty('--header-h');
      window.removeEventListener('resize', setHeaderH);
      if (ro) ro.disconnect();
    };
  }, []);

  if (!loaded) return <div className="container-wide"><div className="loading">読み込み中…</div></div>;

  return (
    <div className="container-wide editor-page">
      <div className="editor-toolbar">
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={uploading}
          onClick={onPickFile}
          title="画像/GIFを添付 (最大50MB)"
        >
          {uploading ? 'アップロード中…' : '🖼 画像を添付'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <button
          type="button"
          className="btn btn-ghost btn-with-icon"
          onClick={() => setAiSidebarOpen(true)}
          title={
            !id
              ? '下書き保存するとAI添削が使えるようになります'
              : !title.trim()
                ? 'タイトルを入力してください'
                : !body.trim()
                  ? '本文を入力してください'
                  : 'AIによる添削レビューを開く'
          }
          disabled={!id || !title.trim() || !body.trim()}
        >
          <BotIcon size={16} />
          <span>AI添削</span>
        </button>
        <button
          className="btn btn-ghost"
          disabled={saving || !title.trim() || !body.trim()}
          title={
            !title.trim()
              ? 'タイトルを入力してください'
              : !body.trim()
                ? '本文を入力してください'
                : '下書きとして保存'
          }
          onClick={() => save(false)}
        >
          下書き保存
        </button>
        <button
          className="btn"
          disabled={saving}
          onClick={() => setPublishPanelOpen(true)}
        >
          {saving ? '保存中…' : '公開する'}
        </button>
      </div>
      <div className="editor-toolbar-note">
        ※ AI添削は「下書き保存」してから押せるようになります
      </div>
      <div className="editor-title-row">
        <input
          className="title-input"
          aria-label="記事タイトル"
          placeholder="タイトル (必須)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {id && (
          <button
            type="button"
            className="editor-delete-btn"
            onClick={() => setDeleteConfirm(true)}
            title="この記事を削除"
          >
            🗑 削除
          </button>
        )}
      </div>
      <details style={{ marginBottom: 12 }} open={!!communityId}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>公開オプション (公開範囲 / 予約公開 / コミュニティ)</summary>
        <div style={{ padding: 12, background: 'var(--accent-soft-10)', border: '1px dashed rgba(95,207,220,.4)', borderRadius: 8, marginTop: 8, display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontWeight: 700, fontSize: 15 }}>公開範囲</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="public">全体公開</option>
              <option value="affiliation_in">特定の所属にのみ公開</option>
              <option value="affiliation_out">特定の所属には非公開</option>
            </select>
            {visibility !== 'public' && (
              <div style={{ marginTop: 6 }}>
                {allAffiliations.map((a) => (
                  <label key={a.id} style={{ marginRight: 8, fontSize: 15 }}>
                    <input
                      type="checkbox"
                      checked={visibilityAffIds.includes(a.id)}
                      onChange={(e) => {
                        if (e.target.checked) setVisibilityAffIds([...visibilityAffIds, a.id]);
                        else setVisibilityAffIds(visibilityAffIds.filter((x) => x !== a.id));
                      }}
                    /> {a.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontWeight: 700, fontSize: 15 }}>コミュニティに投稿</label>
            <select value={communityId} onChange={(e) => setCommunityId(e.target.value)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="">(なし)</option>
              {myCommunities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {communityDetail && communityDetail.timelines.length > 0 && (
              <>
                <label style={{ fontWeight: 700, fontSize: 15, marginLeft: 16 }}>タイムライン (チャンネル)</label>
                <select value={timelineId} onChange={(e) => setTimelineId(e.target.value)}
                  style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
                  {communityDetail.timelines.map((tl) => <option key={tl.id} value={tl.id}># {tl.name}</option>)}
                </select>
              </>
            )}
            {communityId && (
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                投稿先タイムラインを選択。指定しない場合は「ホーム」に自動的に振り分けられます。
              </div>
            )}
            {communityId && communityDetail?.myRole === 'member' && (
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>※メンバー投稿は代表者の承認待ちになります</div>
            )}
          </div>
        </div>
      </details>
      <div className="editor-wrap">
        <textarea
          ref={textareaRef}
          className="editor-pane"
          placeholder="# 本文をMarkdownで… (画像は貼り付け / ドロップ / 🖼ボタン)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onDrop={onDrop}
          onPaste={onPaste}
          onScroll={onEditorScroll}
        />
        <div className="preview-pane-wrap">
          {/* 同期スクロール トグル (プレビュー上部の小さな丸ボタン) */}
          <button
            type="button"
            className={'preview-sync-toggle' + (scrollSync ? ' on' : '')}
            onClick={() => setScrollSync((v) => !v)}
            title={scrollSync ? '同期スクロール: ON' : '同期スクロール: OFF'}
            aria-label="同期スクロール トグル"
          >
            🔗
          </button>
          <div
            ref={previewRef}
            className="preview-pane md"
            onScroll={onPreviewScroll}
            dangerouslySetInnerHTML={{ __html: renderMd(body) }}
          />
        </div>
      </div>
      {/* AI レビューは左サイドバー (折りたたみ可能) */}
      <AIReviewSidebar
        articleId={id || null}
        body={body}
        open={aiSidebarOpen}
        onOpenChange={setAiSidebarOpen}
        onApplyLineFix={(line, newText) => {
          setBody((b) => {
            const lines = b.split('\n');
            if (line < 1 || line > lines.length) return b;
            lines[line - 1] = newText;
            return lines.join('\n');
          });
        }}
        onAppendBody={(text) => {
          setBody((b) => (b.endsWith('\n') ? b + '\n' + text + '\n' : b + '\n\n' + text + '\n'));
        }}
      />
      {/* 削除 確認モーダル (はい/いいえ) */}
      <ConfirmDialog
        open={deleteConfirm}
        title="記事を削除しますか？"
        message="この操作は取り消せません。本当に削除しますか?"
        yesLabel="はい (削除)"
        noLabel="いいえ"
        yesDanger
        onNo={() => setDeleteConfirm(false)}
        onYes={async () => {
          if (!id) return;
          try {
            await api.deleteArticle(id);
            setDeleteConfirm(false);
            nav('/');
          } catch (e: any) {
            alert('削除失敗: ' + e.message);
          }
        }}
      />
      {/* Zenn 風の公開設定パネル (右からスライドイン) */}
      <PublishPanel
        open={publishPanelOpen}
        onClose={() => setPublishPanelOpen(false)}
        emoji={emoji}
        setEmoji={setEmoji}
        type={type}
        setType={setType}
        topics={topics}
        setTopics={setTopics}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        saving={saving}
        onPublish={async () => {
          await save(true);
          setPublishPanelOpen(false);
        }}
      />
    </div>
  );
}
