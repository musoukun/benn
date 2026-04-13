import React, { useState } from 'react';
import { Compass, GitPullRequest, Scale, UserCheck, Wrench, Flag, Shield, Send } from 'lucide-react';
import { LikertScale } from './LikertScale';

type Question = { id: string; dimension: string; text: string };

const QUESTIONS: Question[] = [
  // direction (方向性)
  { id: 'q1', dimension: 'direction', text: '自社が今期何を達成しようとしているか、自分の言葉で説明できる' },
  { id: 'q2', dimension: 'direction', text: '経営層の意思決定に一貫性があり、途中で理由なく覆ることが少ない' },
  // alignment (利害調整)
  { id: 'q3', dimension: 'alignment', text: '部門間の利害調整に無駄な時間を取られていない' },
  { id: 'q4', dimension: 'alignment', text: '営業・開発・現場の間で優先順位が共有されている' },
  // fairness (公正さ)
  { id: 'q5', dimension: 'fairness', text: '評価や処遇の基準が事前に明示されており、結果に納得感がある' },
  { id: 'q6', dimension: 'fairness', text: '成果を出した人が正当に報われ、問題ある行動は是正されている' },
  // leadership (管理職)
  { id: 'q7', dimension: 'leadership', text: '上司は提案や報告の中身を理解した上で判断している' },
  { id: 'q8', dimension: 'leadership', text: '上司に反対意見を伝えても、報復や不利益を受けない' },
  // execution (実行力)
  { id: 'q9', dimension: 'execution', text: '現在のボトルネックがチーム内で特定・共有されている' },
  { id: 'q10', dimension: 'execution', text: 'ボトルネックに対する改善策が実行に移されている' },
  // value (バリュー浸透)
  { id: 'q11', dimension: 'value', text: '判断に迷ったとき、会社のバリューや行動指針が意思決定の基準になっている' },
  { id: 'q12', dimension: 'value', text: '事業として前に進んでいる実感がある' },
  // safety (心理的安全性)
  { id: 'q13', dimension: 'safety', text: '自分の専門性や強みを活かせる業務にアサインされている' },
  { id: 'q14', dimension: 'safety', text: '現状が厳しくても、立て直しの戦略が存在し、そこに向かって動けている' },
  { id: 'q15', dimension: 'safety', text: '仕事の負荷は適切で、来週も前向きに取り組めそうだ' },
];

const DIMENSION_META: Record<string, { label: string; icon: React.ReactNode }> = {
  direction:  { label: '方向性',       icon: <Compass size={18} /> },
  alignment:  { label: '利害調整',     icon: <GitPullRequest size={18} /> },
  fairness:   { label: '公正さ',       icon: <Scale size={18} /> },
  leadership: { label: '管理職',       icon: <UserCheck size={18} /> },
  execution:  { label: '実行力',       icon: <Wrench size={18} /> },
  value:      { label: 'バリュー浸透', icon: <Flag size={18} /> },
  safety:     { label: '心理的安全性', icon: <Shield size={18} /> },
};

type Props = {
  onSubmit: (answers: Record<string, number>, comment?: string) => Promise<void>;
  disabled?: boolean;
};

export function PulseSurveyForm({ onSubmit, disabled }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = QUESTIONS.filter((q) => answers[q.id] != null).length;
  const allAnswered = answeredCount === QUESTIONS.length;

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(answers, comment.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  // 次元ごとにグループ化
  const grouped: { dimension: string; questions: Question[] }[] = [];
  let lastDim = '';
  for (const q of QUESTIONS) {
    if (q.dimension !== lastDim) {
      grouped.push({ dimension: q.dimension, questions: [] });
      lastDim = q.dimension;
    }
    grouped[grouped.length - 1].questions.push(q);
  }

  return (
    <div className="pulse-form">
      <div className="pulse-progress">
        <div className="pulse-progress-bar" style={{ width: `${(answeredCount / QUESTIONS.length) * 100}%` }} />
        <span className="pulse-progress-text">{answeredCount} / {QUESTIONS.length}</span>
      </div>

      {grouped.map((g) => {
        const meta = DIMENSION_META[g.dimension];
        return (
          <div key={g.dimension} className="pulse-dimension-group">
            <div className="pulse-dimension-header">
              {meta.icon}
              <span>{meta.label}</span>
            </div>
            {g.questions.map((q) => (
              <div key={q.id} className="pulse-question">
                <p className="pulse-question-text">{q.text}</p>
                <LikertScale
                  value={answers[q.id] ?? null}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  disabled={disabled || submitting}
                />
              </div>
            ))}
          </div>
        );
      })}

      <div className="pulse-comment-section">
        <label className="pulse-comment-label">今週ひとこと (任意・500文字以内)</label>
        <textarea
          className="pulse-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="自由にどうぞ..."
          rows={3}
          disabled={disabled || submitting}
        />
      </div>

      <button
        className={`btn pulse-submit${allAnswered ? ' pulse-submit-ready' : ''}`}
        onClick={handleSubmit}
        disabled={!allAnswered || submitting || disabled}
      >
        <Send size={16} />
        {submitting ? '送信中...' : '回答を送信'}
      </button>
    </div>
  );
}
