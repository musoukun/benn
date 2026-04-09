import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { renderMd } from '../markdown';
import { TagInput } from '../components/TagInput';
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
  const [type, setType] = useState<'tech' | 'idea'>('tech');
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
      setType((a.type as 'tech' | 'idea') || 'tech');
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
        if (type !== 'tech' && type !== 'idea') {
          alert('カテゴリ(Tech/Idea)を選んでください');
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
        if (published) nav('/articles/' + a.id);
        else if (scheduledAt) alert('予約しました: ' + scheduledAt);
        else alert('下書き保存しました');
      } catch (e: any) {
        alert('保存失敗: ' + e.message);
      } finally {
        setSaving(false);
      }
    },
    [id, title, emoji, type, body, topics, nav, visibility, visibilityAffIds, scheduledAt, communityId, timelineId]
  );

  if (!loaded) return <div className="container-wide"><div className="loading">読み込み中…</div></div>;

  return (
    <div className="container-wide">
      <div className="editor-toolbar">
        <input
          type="text"
          style={{ width: 60, textAlign: 'center', fontSize: 24 }}
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            style={{
              padding: '8px 16px',
              border: 0,
              background: type === 'tech' ? 'var(--tech)' : '#fff',
              color: type === 'tech' ? '#fff' : 'var(--muted)',
              fontWeight: 700,
            }}
            onClick={() => setType('tech')}
          >
            Tech
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              border: 0,
              borderLeft: '1px solid var(--border)',
              background: type === 'idea' ? 'var(--idea)' : '#fff',
              color: type === 'idea' ? '#fff' : 'var(--muted)',
              fontWeight: 700,
            }}
            onClick={() => setType('idea')}
          >
            Idea
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <TagInput
            value={topics}
            onChange={setTopics}
            max={5}
            placeholder="タグを入力してTab/Enter (最大5)"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={uploading}
          onClick={onPickFile}
          title="画像/GIFを挿入 (最大50MB)"
        >
          {uploading ? 'アップロード中…' : '🖼 画像'}
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
          className={'btn btn-ghost' + (scrollSync ? ' on' : '')}
          onClick={() => setScrollSync((v) => !v)}
          title="編集とプレビューを連動スクロール"
        >
          {scrollSync ? '🔗 同期ON' : '🔗 同期OFF'}
        </button>
        <button className="btn btn-ghost" disabled={saving} onClick={() => save(false)}>
          下書き保存
        </button>
        <button className="btn" disabled={saving} onClick={() => save(true)}>
          {saving ? '保存中…' : '公開する'}
        </button>
      </div>
      <input
        className="title-input"
        aria-label="記事タイトル"
        placeholder="タイトル (必須)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <details style={{ marginBottom: 12 }} open={!!communityId}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>公開オプション (公開範囲 / 予約公開 / コミュニティ)</summary>
        <div style={{ padding: 12, background: 'var(--accent-soft-10)', border: '1px dashed rgba(95,207,220,.4)', borderRadius: 8, marginTop: 8, display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontWeight: 700, fontSize: 13 }}>公開範囲</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="public">全体公開</option>
              <option value="affiliation_in">特定の所属にのみ公開</option>
              <option value="affiliation_out">特定の所属には非公開</option>
            </select>
            {visibility !== 'public' && (
              <div style={{ marginTop: 6 }}>
                {allAffiliations.map((a) => (
                  <label key={a.id} style={{ marginRight: 8, fontSize: 13 }}>
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
            <label style={{ fontWeight: 700, fontSize: 13 }}>予約公開</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}
            />
            {scheduledAt && <button type="button" className="btn btn-ghost" onClick={() => setScheduledAt('')} style={{ marginLeft: 8 }}>クリア</button>}
          </div>
          <div>
            <label style={{ fontWeight: 700, fontSize: 13 }}>コミュニティに投稿</label>
            <select value={communityId} onChange={(e) => setCommunityId(e.target.value)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="">(なし)</option>
              {myCommunities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {communityDetail && communityDetail.timelines.length > 0 && (
              <>
                <label style={{ fontWeight: 700, fontSize: 13, marginLeft: 16 }}>タイムライン (チャンネル)</label>
                <select value={timelineId} onChange={(e) => setTimelineId(e.target.value)}
                  style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
                  {communityDetail.timelines.map((tl) => <option key={tl.id} value={tl.id}># {tl.name}</option>)}
                </select>
              </>
            )}
            {communityId && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                投稿先タイムラインを選択。指定しない場合は「ホーム」に自動的に振り分けられます。
              </div>
            )}
            {communityId && communityDetail?.myRole === 'member' && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>※メンバー投稿は代表者の承認待ちになります</div>
            )}
          </div>
        </div>
      </details>
      <div className="editor-wrap">
        <div className="editor-pane">
          <textarea
            ref={textareaRef}
            placeholder="# 本文をMarkdownで… (画像は貼り付け / ドロップ / 🖼ボタン)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onDrop={onDrop}
            onPaste={onPaste}
            onScroll={onEditorScroll}
          />
        </div>
        <div
          ref={previewRef}
          className="preview-pane md"
          onScroll={onPreviewScroll}
          dangerouslySetInnerHTML={{ __html: renderMd(body) }}
        />
      </div>
    </div>
  );
}
