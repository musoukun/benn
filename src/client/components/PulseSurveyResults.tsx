import React from 'react';
import { Compass, GitPullRequest, Scale, UserCheck, Wrench, Flag, Shield } from 'lucide-react';
import type { PulseSurveyDetail } from '../types';

const DIMENSIONS = [
  { key: 'direction',  label: '方向性',       icon: <Compass size={14} /> },
  { key: 'alignment',  label: '利害調整',     icon: <GitPullRequest size={14} /> },
  { key: 'fairness',   label: '公正さ',       icon: <Scale size={14} /> },
  { key: 'leadership', label: '管理職',       icon: <UserCheck size={14} /> },
  { key: 'execution',  label: '実行力',       icon: <Wrench size={14} /> },
  { key: 'value',      label: 'バリュー浸透', icon: <Flag size={14} /> },
  { key: 'safety',     label: '心理的安全性', icon: <Shield size={14} /> },
] as const;

const QUESTIONS = [
  { id: 'q1',  dim: 'direction',  short: '戦略の明確さ' },
  { id: 'q2',  dim: 'direction',  short: '意思決定の一貫性' },
  { id: 'q3',  dim: 'alignment',  short: '部門間調整コスト' },
  { id: 'q4',  dim: 'alignment',  short: '優先順位の共有' },
  { id: 'q5',  dim: 'fairness',   short: '評価基準の透明性' },
  { id: 'q6',  dim: 'fairness',   short: '成果への報酬' },
  { id: 'q7',  dim: 'leadership', short: '上司の理解力' },
  { id: 'q8',  dim: 'leadership', short: '反対意見の安全性' },
  { id: 'q9',  dim: 'execution',  short: 'ボトルネック可視化' },
  { id: 'q10', dim: 'execution',  short: '改善策の実行' },
  { id: 'q11', dim: 'value',      short: 'バリューの実用度' },
  { id: 'q12', dim: 'value',      short: '事業の前進実感' },
  { id: 'q13', dim: 'safety',     short: '適材適所' },
  { id: 'q14', dim: 'safety',     short: '立て直し戦略' },
  { id: 'q15', dim: 'safety',     short: '負荷と意欲' },
];

/** 10点満点でのスコアカラー */
function scoreColor(v: number): string {
  if (v <= 0) return 'var(--muted)';
  if (v < 4) return '#ef4444';
  if (v < 6) return '#f59e0b';
  return 'var(--accent)';
}

function moodText(overall: number): string {
  if (overall <= 0) return 'データなし';
  if (overall < 4) return '要改善';
  if (overall < 6) return '平均的';
  if (overall < 8) return '良好';
  return '非常に良い';
}

// ---------- 7角形レーダー (SVG) ----------

function HeptagonRadar({ dimensions }: { dimensions: Record<string, number> }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;

  const angles = DIMENSIONS.map((_, i) => (Math.PI * 2 * i) / DIMENSIONS.length - Math.PI / 2);

  const gridPoints = (scale: number) =>
    angles.map((a) => `${cx + r * scale * Math.cos(a)},${cy + r * scale * Math.sin(a)}`).join(' ');

  const dataPoints = angles
    .map((a, i) => {
      const key = DIMENSIONS[i].key;
      const v = (dimensions[key] || 0) / 10; // 10点満点
      return `${cx + r * v * Math.cos(a)},${cy + r * v * Math.sin(a)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pulse-radar" width={size} height={size}>
      {[0.2, 0.4, 0.6, 0.8, 1].map((s) => (
        <polygon key={s} points={gridPoints(s)} fill="none" stroke="var(--border)" strokeWidth="0.5" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="var(--border)" strokeWidth="0.5" />
      ))}
      <polygon points={dataPoints} fill="var(--accent-soft-20)" stroke="var(--accent)" strokeWidth="2" />
      {angles.map((a, i) => {
        const lx = cx + (r + 26) * Math.cos(a);
        const ly = cy + (r + 26) * Math.sin(a);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="10" fill="var(--text)">
            {DIMENSIONS[i].label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- 回答率リング ----------

function ResponseRateRing({ rate, count, total }: { rate: number; count: number; total: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div className="pulse-rate-ring">
      <svg viewBox="0 0 100 100" width={100} height={100}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" stroke="var(--accent)" strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="50" y="46" textAnchor="middle" fontSize="16" fontWeight="bold" fill="var(--text)">
          {rate}%
        </text>
        <text x="50" y="62" textAnchor="middle" fontSize="9" fill="var(--muted)">
          {count}/{total}
        </text>
      </svg>
      <span className="pulse-rate-label">回答率</span>
    </div>
  );
}

// ---------- メインコンポーネント ----------

type Props = {
  survey: PulseSurveyDetail;
};

export function PulseSurveyResults({ survey }: Props) {
  const overall = survey.overall ?? 0;
  const responseRate = survey.memberCount > 0 ? Math.round((survey.responseCount / survey.memberCount) * 100) : 0;

  return (
    <div className="pulse-results">
      {/* サマリー */}
      <div className="pulse-summary-row">
        <div className="pulse-mood card">
          <div className="pulse-mood-score" style={{ color: scoreColor(overall) }}>
            {overall > 0 ? overall.toFixed(1) : '-'}
          </div>
          <div className="pulse-mood-text">{moodText(overall)}</div>
          <div className="pulse-mood-sub">/ 10.0</div>
        </div>
        <ResponseRateRing rate={responseRate} count={survey.responseCount} total={survey.memberCount} />
      </div>

      {/* ジャンル別スコア一覧 */}
      <div className="card pulse-dim-scores">
        <h3>ジャンル別スコア</h3>
        {DIMENSIONS.map((d) => {
          const v = (survey.dimensions as Record<string, number>)[d.key] ?? 0;
          return (
            <div key={d.key} className="pulse-bar-row">
              <span className="pulse-bar-label">{d.icon} {d.label}</span>
              <div className="pulse-bar-track">
                <div className="pulse-bar-fill" style={{ width: `${(v / 10) * 100}%`, backgroundColor: scoreColor(v) }} />
              </div>
              <span className="pulse-bar-value" style={{ color: scoreColor(v) }}>
                {v > 0 ? v.toFixed(1) : '-'}
              </span>
            </div>
          );
        })}
      </div>

      {/* レーダー */}
      <div className="card pulse-radar-card">
        <h3>組織ヘルスマップ</h3>
        <HeptagonRadar dimensions={survey.dimensions as Record<string, number>} />
      </div>

      {/* 質問ごとの棒グラフ */}
      <div className="card pulse-bars-card">
        <h3>質問別スコア (raw 1-5)</h3>
        {QUESTIONS.map((q) => {
          const avg = survey.averages[q.id] ?? 0;
          return (
            <div key={q.id} className="pulse-bar-row">
              <span className="pulse-bar-label">{q.short}</span>
              <div className="pulse-bar-track">
                <div
                  className="pulse-bar-fill"
                  style={{ width: `${(avg / 5) * 100}%`, backgroundColor: scoreColor(avg * 2) }}
                />
              </div>
              <span className="pulse-bar-value" style={{ color: scoreColor(avg * 2) }}>
                {avg > 0 ? avg.toFixed(1) : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
