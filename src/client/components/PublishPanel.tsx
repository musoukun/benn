import React, { useEffect, useRef, useState } from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { TagInput } from './TagInput';

// 「公開設定」パネル (右からスライドイン)
// - 記事アイコン / トピック / カテゴリー / 公開予約 を新規・編集どちらでも設定可能
// - 「公開する」を押すと onPublish (= save(true)) が呼ばれる

export function PublishPanel({
  open,
  onClose,
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
  emoji: string;
  setEmoji: (v: string) => void;
  type: 'howto' | 'diary';
  setType: (v: 'howto' | 'diary') => void;
  topics: string[];
  setTopics: (v: string[]) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  onPublish: () => void;
  saving: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  // 外側クリックで EmojiPicker を閉じる
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

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
          <section className="publish-panel-section">
            <label className="publish-panel-label">記事アイコンを設定</label>
              <div className="publish-panel-emoji-row" ref={pickerWrapRef}>
                <button
                  type="button"
                  className="publish-panel-emoji-trigger"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-label="絵文字を選ぶ"
                >
                  <span className="publish-panel-emoji-trigger-icon">{emoji || '📝'}</span>
                  <span className="publish-panel-emoji-trigger-label">
                    クリックして絵文字を選ぶ
                  </span>
                </button>
                {pickerOpen && (
                  <div className="publish-panel-emoji-popover">
                    <EmojiPicker
                      onEmojiClick={(data) => {
                        setEmoji(data.emoji);
                        setPickerOpen(false);
                      }}
                      emojiStyle={EmojiStyle.NATIVE}
                      theme={Theme.LIGHT}
                      width={340}
                      height={400}
                      lazyLoadEmojis
                      searchPlaceholder="絵文字を検索..."
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
            </div>
          </section>

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

          <section className="publish-panel-section">
            <label className="publish-panel-label">
              カテゴリー <span className="publish-panel-sub">選択</span>
            </label>
            <div className="publish-panel-category">
              <button
                type="button"
                className={'publish-panel-cat-card' + (type === 'howto' ? ' active' : '')}
                onClick={() => setType('howto')}
              >
                <div className="publish-panel-cat-title">Howto</div>
                <div className="publish-panel-cat-desc">
                  実装手順・ハンズオン・ツールの使い方など「やってみた / やり方」系のメモ
                </div>
              </button>
              <button
                type="button"
                className={'publish-panel-cat-card' + (type === 'diary' ? ' active' : '')}
                onClick={() => setType('diary')}
              >
                <div className="publish-panel-cat-title">Diary</div>
                <div className="publish-panel-cat-desc">
                  業務の経緯・ふりかえり・ドメイン知識・雑感など「物語性のある」記事
                </div>
              </button>
            </div>
          </section>

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
