import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { setMe as setGlobalMe, useMe } from '../useMe';
import { Avatar } from './Avatar';
import { AvatarSection } from './AvatarSection';

// プロフィール編集の共通コンポーネント
// - 1つのカードに アバター + 名前 + 自己紹介 をまとめる
// - 「保存」ボタンを押すまで一切 commit しない (アバターも含めて一括保存)
// - ProfilePage (自分のページのペンマーク → 編集モード) と
//   AccountSettingsPage (プロフィールタブ) の両方で使う共通実装
export function ProfileEditor({
  onDone,
}: {
  onDone?: () => void;
} = {}) {
  const me = useMe();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name || '');
      setBio(me.bio || '');
    }
  }, [me?.id]);

  // 親に渡された Pending File から blob URL を作ってプレビューに使う
  const onPendingFile = (file: File) => {
    setPendingAvatar(file);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const patch: { name: string; bio: string; avatarUrl?: string } = { name, bio };
      if (pendingAvatar) {
        const up = await api.uploadFile(pendingAvatar);
        patch.avatarUrl = up.url;
      }
      const updated = await api.updateMe(patch);
      setGlobalMe(updated);
      setPendingAvatar(null);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingPreviewUrl(null);
      setMsg('プロフィールを更新しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!me) return <div className="card">…</div>;

  // 表示用 user (プレビュー画像があればそれを優先)
  const previewUser = {
    ...me,
    name,
    avatarUrl: pendingPreviewUrl || me.avatarUrl,
  };

  return (
    <div className="card profile-editor">
      <h3 style={{ marginTop: 0 }}>プロフィール編集</h3>

      {/* ヘッダー: 大アバター + 現状プレビュー */}
      <div className="profile-editor-header">
        <Avatar user={previewUser} size="lg" />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{name || me.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            {pendingAvatar ? '画像確定済み (保存で反映)' : 'クリック範囲下のフォームから画像を変更できます'}
          </div>
        </div>
      </div>

      {/* 名前 */}
      <label className="profile-editor-label">表示名</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        className="profile-editor-input"
        placeholder="名前"
      />

      {/* 自己紹介 */}
      <label className="profile-editor-label" style={{ marginTop: 12 }}>
        自己紹介
      </label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={500}
        className="profile-editor-textarea"
        placeholder="自己紹介 (500文字まで)"
      />

      {/* アバター画像編集 (controlled, bare) */}
      <div className="profile-editor-avatar-block">
        <label className="profile-editor-label">プロフィール画像</label>
        <AvatarSection bare onPendingFile={onPendingFile} />
      </div>

      {/* 一括保存 */}
      <div className="profile-editor-actions">
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? '保存中…' : pendingAvatar ? '保存 (画像も反映)' : '保存'}
        </button>
        {onDone && (
          <button className="btn btn-ghost" onClick={onDone}>
            閉じる
          </button>
        )}
        {msg && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}
