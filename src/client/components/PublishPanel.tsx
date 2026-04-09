import React from 'react';
import { TagInput } from './TagInput';

// Zenn 風の「公開設定」パネル (右からスライドイン)
// - 編集時 (isEdit=true) は アイキャッチ絵文字 と カテゴリー を非表示
// - 「公開する」を押すと onPublish (= save(true)) が呼ばれる
const EMOJI_PALETTE = [
  '📝', '💡', '🚀', '🔥', '⚡', '✨', '🎯', '🛠',
  '🐛', '🎨', '📚', '🌱', '🧠', '🎉', '💻', '🌟',
  '🔍', '📊', '⚙️', '🤖', '🍀', '🦄', '🐱', '☕',
];

export function PublishPanel({
  open,
  onClose,
  isEdit,
  emoji,
  setEmoji,
  type,
  setType,
  topics,
  setTopics,
  scheduledAt,
  setScheduledAt,
  onPublish,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  isEdit: boolean;
  emoji: string;
  setEmoji: (v: string) => void;
  type: 'tech' | 'idea';
  setType: (v: 'tech' | 'idea') => void;
  topics: string[];
  setTopics: (v: string[]) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  onPublish: () => void;
  saving: boolean;
}) {
  if (!open) return null;

  // 公開ボタンのバリデーション (Zenn 同様)
  const needsTopic = topics.length === 0;
  const hint = needsTopic ? 'トピックを設定してください' : null;
  const canPublish = !saving && !needsTopic;

  return (
    <>
      <div className="publish-panel-backdrop" onClick={onClose} />
      <aside className="publish-panel">
        <div className="publish-panel-head">
          <button
            type="button"
            className="publish-panel-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
          <h3>公開設定</h3>
        </div>
        <div className="publish-panel-body">
          {!isEdit && (
            <section className="publish-panel-section">
              <label className="publish-panel-label">アイキャッチ絵文字を変更</label>
              <div className="publish-panel-emoji-row">
                <input
                  type="text"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  className="publish-panel-emoji-input"
                  maxLength={4}
                />
                <div className="publish-panel-emoji-palette">
                  {EMOJI_PALETTE.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={'publish-panel-emoji-cell' + (emoji === e ? ' active' : '')}
                      onClick={() => setEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="publish-panel-section">
            <label className="publish-panel-label">
              トピック <span className="publish-panel-sub">関連する技術や言語を選びましょう</span>
            </label>
            <TagInput
              value={topics}
              onChange={setTopics}
              max={5}
              placeholder="トピックを入力 (Tab/Enter)"
            />
          </section>

          {!isEdit && (
            <section className="publish-panel-section">
              <label className="publish-panel-label">
                カテゴリー <span className="publish-panel-sub">選択</span>
              </label>
              <div className="publish-panel-category">
                <button
                  type="button"
                  className={'publish-panel-cat-card' + (type === 'tech' ? ' active' : '')}
                  onClick={() => setType('tech')}
                >
                  <div className="publish-panel-cat-title">Tech</div>
                  <div className="publish-panel-cat-desc">
                    ソフトウェアやハードウェアに関する技術記事 (実装/解説/手順)
                  </div>
                </button>
                <button
                  type="button"
                  className={'publish-panel-cat-card' + (type === 'idea' ? ' active' : '')}
                  onClick={() => setType('idea')}
                >
                  <div className="publish-panel-cat-title">Idea</div>
                  <div className="publish-panel-cat-desc">
                    技術記事におさまらないプログラマー向けのアイデアや雑談
                  </div>
                </button>
              </div>
            </section>
          )}

          <section className="publish-panel-section">
            <label className="publish-panel-label">公開予約</label>
            <div className="publish-panel-schedule-row">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="publish-panel-schedule-input"
              />
              {scheduledAt && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setScheduledAt('')}
                >
                  クリア
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="publish-panel-footer">
          {hint && <div className="publish-panel-hint">{hint}</div>}
          <button
            type="button"
            className="btn publish-panel-submit"
            disabled={!canPublish}
            onClick={onPublish}
          >
            {saving ? '保存中…' : scheduledAt ? '予約する' : '公開する'}
          </button>
        </div>
      </aside>
    </>
  );
}
