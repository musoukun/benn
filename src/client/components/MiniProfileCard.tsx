import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { api } from '../api';
import { useMe } from '../useMe';
import type { UserProfile } from '../types';

type Props = {
  userId: string;
  /** カード表示位置 */
  position: { top: number; left: number };
  onClose: () => void;
};

export function MiniProfileCard({ userId, position, onClose }: Props) {
  const me = useMe();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getUser(userId).then(setProfile).catch(() => {});
  }, [userId]);

  // 外部クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Escで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const isSelf = me?.id === userId;

  // 画面外にはみ出さないよう調整
  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.top, window.innerHeight - 320),
    left: Math.min(position.left, window.innerWidth - 300),
    zIndex: 200,
  };

  return (
    <div className="mini-profile-card" style={adjustedStyle} ref={cardRef}>
      {!profile ? (
        <div className="mini-profile-loading">読み込み中...</div>
      ) : (
        <>
          <div className="mini-profile-header">
            <Avatar user={profile} size={56} />
            <div className="mini-profile-info">
              <div className="mini-profile-name">{profile.name}</div>
              {profile.bio && <div className="mini-profile-bio">{profile.bio}</div>}
            </div>
          </div>
          {profile.affiliations && profile.affiliations.length > 0 && (
            <div className="mini-profile-affiliations">
              {profile.affiliations.map((a) => (
                <span key={a.id} className="mini-profile-tag">{a.name}</span>
              ))}
            </div>
          )}
          {profile.stats && (
            <div className="mini-profile-stats">
              <span>{profile.stats.articleCount} 記事</span>
              <span>{profile.stats.followerCount} フォロワー</span>
            </div>
          )}
          <div className="mini-profile-actions">
            {isSelf ? (
              <Link to="/me/settings" className="mini-profile-btn" onClick={onClose}>
                 プロフィールを編集
              </Link>
            ) : (
              <Link to={`/users/${userId}`} className="mini-profile-btn" onClick={onClose}>
                プロフィールを表示
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
