import React from 'react';

const LABELS = ['', '全くそう思わない', 'そう思わない', 'どちらとも', 'そう思う', 'とてもそう思う'];

type Props = {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export function LikertScale({ value, onChange, disabled }: Props) {
  return (
    <div className="likert-scale">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`likert-btn${value === n ? ' selected' : ''}${n <= 2 ? ' low' : n >= 4 ? ' high' : ' mid'}`}
          onClick={() => !disabled && onChange(n)}
          disabled={disabled}
          title={LABELS[n]}
        >
          <span className="likert-num">{n}</span>
          <span className="likert-label">{LABELS[n]}</span>
        </button>
      ))}
    </div>
  );
}
