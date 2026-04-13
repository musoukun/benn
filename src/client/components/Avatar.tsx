import React from 'react';

type Props = {
  user: { name?: string | null; avatarUrl?: string | null; avatarColor?: string | null } | null | undefined;
  size?: 'lg';
};

// 背景色に対して読みやすい文字色を返す (相対輝度で判定)
function contrastText(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // YIQ 方式
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#0f172a' : '#ffffff';
}

export function Avatar({ user, size }: Props) {
  if (!user) return <span className="avatar" />;
  const initial = (user.name || '?').charAt(0).toUpperCase();
  const cls = 'avatar' + (size === 'lg' ? ' lg' : '');
  if (user.avatarUrl) {
    return (
      <span className={cls + ' avatar-img'}>
        <img src={user.avatarUrl} alt={user.name || ''} />
      </span>
    );
  }
  const bg = user.avatarColor || undefined;
  const fg = bg ? contrastText(bg) : undefined;
  return (
    <span className={cls} style={bg ? { background: bg, color: fg } : undefined}>
      {initial}
    </span>
  );
}
