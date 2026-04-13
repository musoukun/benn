import React from 'react';
import { Compass, GitPullRequest, Scale, UserCheck, Wrench, Flag, Shield } from 'lucide-react';
import type { PulseTrendData } from '../types';

const DIMENSIONS = [
  { key: 'direction',  label: '方向性',       icon: <Compass size={14} />,        color: '#3b82f6' },
  { key: 'alignment',  label: '利害調整',     icon: <GitPullRequest size={14} />,  color: '#06b6d4' },
  { key: 'fairness',   label: '公正さ',       icon: <Scale size={14} />,           color: '#8b5cf6' },
  { key: 'leadership', label: '管理職',       icon: <UserCheck size={14} />,       color: '#f59e0b' },
  { key: 'execution',  label: '実行力',       icon: <Wrench size={14} />,          color: '#10b981' },
  { key: 'value',      label: 'バリュー浸透', icon: <Flag size={14} />,            color: '#ec4899' },
  { key: 'safety',     label: '心理的安全性', icon: <Shield size={14} />,          color: '#ef4444' },
] as const;

function formatPeriod(label: string): string {
  const wm = label.match(/W(\d+)/);
  if (wm) return `W${wm[1]}`;
  const mm = label.match(/^\d{4}-(\d{2})$/);
  if (mm) return `${parseInt(mm[1])}月`;
  return label;
}

function scoreColor(v: number): string {
  if (v <= 0) return 'var(--muted)';
  if (v < 4) return '#ef4444';
  if (v < 6) return '#f59e0b';
  return 'var(--accent)';
}

/** 差分を矢印+数値で表示 */
function DiffBadge({ current, previous, label }: { current: number; previous: number | null; label: string }) {
  if (previous === null || previous <= 0 || current <= 0) {
    return <span className="pulse-diff pulse-diff-na">{label}: —</span>;
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) {
    return <span className="pulse-diff pulse-diff-up">{label}: ↑{diff.toFixed(1)}</span>;
  }
  if (diff < 0) {
    return <span className="pulse-diff pulse-diff-down">{label}: ↓{Math.abs(diff).toFixed(1)}</span>;
  }
  return <span className="pulse-diff pulse-diff-same">{label}: → 0</span>;
}

// ---------- ジャンル別スコア (現在値 + 先週比 + 先月比) ----------

function GenreScores({ trends }: { trends: PulseTrendData[] }) {
  if (trends.length === 0) return null;

  const current = trends[trends.length - 1];
  const lastWeek = trends.length >= 2 ? trends[trends.length - 2] : null;
  // 先月 ≒ 4週前 (なければ最も古いデータ)
  const lastMonth = trends.length >= 5 ? trends[trends.length - 5] : (trends.length >= 2 ? trends[0] : null);

  return (
    <div className="pulse-genre-scores">
      {DIMENSIONS.map((dim) => {
        const val = (current.dimensions as Record<string, number>)[dim.key] ?? 0;
        const prevWeek = lastWeek ? (lastWeek.dimensions as Record<string, number>)[dim.key] ?? 0 : null;
        const prevMonth = lastMonth ? (lastMonth.dimensions as Record<string, number>)[dim.key] ?? 0 : null;
        return (
          <div key={dim.key} className="pulse-genre-row">
            <div className="pulse-genre-label">
              <span style={{ color: dim.color }}>{dim.icon}</span>
              <span className="pulse-genre-name">{dim.label}</span>
            </div>
            <div className="pulse-genre-score" style={{ color: scoreColor(val) }}>
              {val > 0 ? val.toFixed(1) : '-'}
            </div>
            <div className="pulse-genre-diffs">
              <DiffBadge current={val} previous={prevWeek} label="先週比" />
              <DiffBadge current={val} previous={prevMonth} label="先月比" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 総合スコア推移 ----------

function OverallTrend({ data }: { data: { period: string; value: number }[] }) {
  if (data.length === 0) return null;

  const w = 280;
  const h = 60;
  const padX = 30;
  const padY = 10;
  const barW = Math.min(20, (w - padX * 2) / data.length - 2);

  function barColor(v: number): string {
    if (v < 4) return '#ef4444';
    if (v < 6) return '#f59e0b';
    return 'var(--accent)';
  }

  return (
    <div className="pulse-rate-trend">
      <h4>総合スコア推移 (/ 10)</h4>
      <svg viewBox={`0 0 ${w} ${h + 16}`} width={w} height={h + 16} className="pulse-rate-trend-svg">
        {data.map((d, i) => {
          const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX * 2) - barW / 2;
          const barH = (d.value / 10) * (h - padY);
          const y = h - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={2} fill={barColor(d.value)} />
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill="var(--text)" fontWeight="600">
                {d.value.toFixed(1)}
              </text>
              <text x={x + barW / 2} y={h + 12} textAnchor="middle" fontSize="8" fill="var(--muted)">
                {d.period}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- 回答率推移 ----------

function ResponseRateTrend({ data }: { data: { period: string; rate: number }[] }) {
  if (data.length === 0) return null;

  const w = 280;
  const h = 60;
  const padX = 30;
  const padY = 10;
  const barW = Math.min(16, (w - padX * 2) / data.length - 2);

  return (
    <div className="pulse-rate-trend">
      <h4>回答率推移</h4>
      <svg viewBox={`0 0 ${w} ${h + 16}`} width={w} height={h + 16} className="pulse-rate-trend-svg">
        {data.map((d, i) => {
          const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX * 2) - barW / 2;
          const barH = (d.rate / 100) * (h - padY);
          const y = h - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={2} fill="var(--accent-soft-30)" />
              <text x={x + barW / 2} y={h + 12} textAnchor="middle" fontSize="8" fill="var(--muted)">
                {d.period}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- メイン ----------

type Props = {
  trends: PulseTrendData[];
};

export function PulseSurveyTrends({ trends }: Props) {
  if (trends.length === 0) {
    return <div className="empty">トレンドデータがまだありません</div>;
  }

  return (
    <div className="pulse-trends">
      <div className="card">
        <h3>ジャンル別スコア</h3>
        <GenreScores trends={trends} />
      </div>

      <div className="card">
        <OverallTrend
          data={trends.map((t) => ({
            period: formatPeriod(t.periodLabel),
            value: t.overall ?? 0,
          }))}
        />
      </div>

      <div className="card">
        <ResponseRateTrend
          data={trends.map((t) => ({
            period: formatPeriod(t.periodLabel),
            rate: t.responseRate,
          }))}
        />
      </div>
    </div>
  );
}
