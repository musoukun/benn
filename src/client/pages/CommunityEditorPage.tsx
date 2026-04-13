import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { renderMd } from '../markdown';
import { AIReviewSidebar } from '../components/AIReviewSidebar';
import { BotIcon } from '../components/BotIcon';
import { PublishPanel } from '../components/PublishPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { CommunityFull } from '../types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// コミュニティ専用エディタ
// URL: /communities/:communityId/editor  (新規)
//      /communities/:communityId/editor/:id  (既存記事編集)
export function CommunityEditorPage() {
  const { communityId, id } = useParams<{ communityId: string; id?: string }>();
  const nav = useNavigate();
  const [search] = useSearchParams();

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📝');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // コミュニティ情報
  const [community, setCommunity] = useState<CommunityFull | null>(null);
  const [timelineId, setTimelineId] = useState<string>('');

  // クエリパラメータから初期タイムラインを取得
  const initialTimelineId = search.get('timelineId') || '';

  useEffect(() => {
    if (!communityId) return;
    api.getCommunity(communityId).then((c) => {
      setCommunity(c);
      // 初期タイムライン: クエリパラメータ → 最初のタイムライン
      const tid = initialTimelineId || (c.timelines.length > 0 ? c.timelines[0].id : '');
      setTimelineId(tid);
    }).catch(() => nav('/communities'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  // ファイルアップロード
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

  const onEditorScroll = useCallback(() => {
    if (!scrollSync) return;
    if (syncingRef.current === 'preview') { syncingRef.current = null; return; }
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const max = ta.scrollHeight - ta.clientHeight;
    if (max <= 0) return;
    syncingRef.current = 'edit';
    pv.scrollTop = (ta.scrollTop / max) * (pv.scrollHeight - pv.clientHeight);
  }, [scrollSync]);

  const onPreviewScroll = useCallback(() => {
    if (!scrollSync) return;
    if (syncingRef.current === 'edit') { syncingRef.current = null; return; }
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const max = pv.scrollHeight - pv.clientHeight;
    if (max <= 0) return;
    syncingRef.current = 'preview';
    ta.scrollTop = (pv.scrollTop / max) * (ta.scrollHeight - ta.clientHeight);
  }, [scrollSync]);

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) { setBody((b) => b + snippet); return; }
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
      if (file.size > MAX_UPLOAD_BYTES) { alert('ファイルサイズは 50MB までです'); return; }
      if (!file.type.startsWith('image/')) { alert('画像ファイルのみアップロードできます'); return; }
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
      const f = e.target.files?.[0]; e.target.value = '';
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
      const imgs = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter((f): f is File => !!f);
      if (imgs.length === 0) return;
      e.preventDefault();
      for (const f of imgs) await uploadAndInsert(f);
    },
    [uploadAndInsert]
  );

  // 既存記事の読み込み
  useEffect(() => {
    if (!id) return;
    api.getArticle(id).then((a) => {
      if (!a) return;
      setTitle(a.title || '');
      setEmoji(a.emoji || '📝');
      setBody(a.body || '');
      setTopics((a.topics || []).map((t) => t.name));
      if (a.scheduledAt) setScheduledAt(a.scheduledAt.slice(0, 16));
      if (a.timelineId) setTimelineId(a.timelineId);
      setLoaded(true);
    });
  }, [id]);

  const save = useCallback(
    async (published: boolean) => {
      if (published) {
        if (!title.trim()) { alert('タイトルを入力してください'); return; }
        if (topics.length === 0) { alert('トピックを最低1つ入力してください'); return; }
      }
      setSaving(true);
      const payload: any = {
        title,
        emoji,
        type: 'howto', // コミュニティ記事はカテゴリ不問、デフォルト howto
        body,
        topicNames: topics,
        published,
        visibility: 'public', // コミュニティ側で可視性をコントロール
        communityId: communityId || null,
        timelineId: timelineId || null,
        scheduledAt: scheduledAt || null,
      };
      try {
        const a = id
          ? await api.updateArticle(id, payload)
          : await api.createArticle(payload);
        if (published) {
          nav(`/communities/${communityId}`);
        } else {
          if (!id) nav(`/communities/${communityId}/editor/${a.id}`, { replace: true });
          if (scheduledAt) alert('予約しました: ' + scheduledAt);
          else alert('下書き保存しました');
        }
      } catch (e: any) {
        alert('保存失敗: ' + e.message);
      } finally {
        setSaving(false);
      }
    },
    [id, communityId, title, emoji, body, topics, nav, timelineId, scheduledAt]
  );

  // overflow hidden + ヘッダ高さ計算
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
    if (header && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(setHeaderH); ro.observe(header); }
    window.addEventListener('resize', setHeaderH);
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.documentElement.style.removeProperty('--header-h');
      window.removeEventListener('resize', setHeaderH);
      if (ro) ro.disconnect();
    };
  }, []);

  if (!loaded || !community) return <div className="container-wide"><div className="loading">読み込み中…</div></div>;

  return (
    <div className="container-wide editor-page">
      <div className="editor-toolbar">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => nav(`/communities/${communityId}`)}
          title="コミュニティに戻る"
        >
          ← {community.name}
        </button>
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
          {saving ? '保存中…' : 'タイムラインに公開'}
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
            nav(`/communities/${communityId}`);
          } catch (e: any) {
            alert('削除失敗: ' + e.message);
          }
        }}
      />
      <PublishPanel
        mode="community"
        open={publishPanelOpen}
        onClose={() => setPublishPanelOpen(false)}
        emoji={emoji}
        setEmoji={setEmoji}
        topics={topics}
        setTopics={setTopics}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        communityName={community.name}
        timelines={community.timelines}
        timelineId={timelineId}
        setTimelineId={setTimelineId}
        saving={saving}
        onPublish={async () => {
          await save(true);
          setPublishPanelOpen(false);
        }}
      />
    </div>
  );
}
