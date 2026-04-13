/**
 * @mention ユーティリティ
 * メンション形式: @[表示名](userId) — everyone の場合は @[everyone](everyone)
 */

/** メンション正規表現 */
export const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** テキスト中のメンションをパース */
export type MentionToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; displayName: string; userId: string };

export function parseMentions(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let lastIndex = 0;
  const re = new RegExp(MENTION_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'mention', displayName: match[1], userId: match[2] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return tokens;
}

/** メンション文字列を構築 */
export function buildMention(name: string, userId: string): string {
  return `@[${name}](${userId})`;
}

/** テキストに自分宛てメンション (@everyone 含む) が含まれるか */
export function hasMentionForMe(text: string, myUserId: string): boolean {
  const re = new RegExp(MENTION_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[2] === myUserId || match[2] === 'everyone') return true;
  }
  return false;
}
