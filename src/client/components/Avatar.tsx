import React from 'react';

type Props = {
  user: { name?: string | null; avatarUrl?: string | null } | null | undefined;
  size?: 'lg';
};

export function Avatar({ user, size }: Props) {
  if (!user) return <span className="avatar" />;
  const initial = (user.name || '?').charAt(0).toUpperCase();
  const cls = 'avatar' + (size === 'lg' ? ' lg' : '');
  // avatarUrl があれば画像、なければイニシャル文字
  if (user.avatarUrl) {
    return (
      <span className={cls + ' avatar-img'}>
        <img src={user.avatarUrl} alt={user.name || ''} />
      </span>
    );
  }
  return <span className={cls}>{initial}</span>;
}
