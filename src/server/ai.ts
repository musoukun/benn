// AIプロバイダ呼び出しの抽象化。OpenAI / Anthropic / Gemini の最小限の chat 実装。
// API 仕様 (2026年4月時点):
//   OpenAI:    POST https://api.openai.com/v1/chat/completions
//   Anthropic: POST https://api.anthropic.com/v1/messages   header: x-api-key, anthropic-version: 2023-06-01
//   Gemini:    POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=KEY
import { prisma } from './db';
import { decryptSecret } from './crypto';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export interface CallOptions {
  system?: string;
  user: string;
  // JSON モード希望時に "json" を渡す
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
}

export async function callLLM(userId: string, opts: CallOptions): Promise<string> {
  const cfg = await prisma.userAIConfig.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  if (!cfg) {
    throw new Error('AIプロバイダが未設定です。アカウント設定から登録してください。');
  }
  const apiKey = decryptSecret(cfg.apiKeyEnc);
  const provider = cfg.provider as AIProvider;
  if (provider === 'openai') return callOpenAI(cfg.endpoint, cfg.model, apiKey, opts);
  if (provider === 'anthropic') return callAnthropic(cfg.endpoint, cfg.model, apiKey, opts);
  if (provider === 'gemini') return callGemini(cfg.endpoint, cfg.model, apiKey, opts);
  throw new Error('不明なプロバイダ: ' + provider);
}

async function callOpenAI(
  endpoint: string | null,
  model: string,
  apiKey: string,
  opts: CallOptions
): Promise<string> {
  const url = (endpoint || 'https://api.openai.com/v1') + '/chat/completions';
  const messages: any[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });
  const body: any = { model, messages };
  if (opts.responseFormat === 'json') body.response_format = { type: 'json_object' };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

async function callAnthropic(
  endpoint: string | null,
  model: string,
  apiKey: string,
  opts: CallOptions
): Promise<string> {
  const url = (endpoint || 'https://api.anthropic.com/v1') + '/messages';
  const body: any = {
    model,
    max_tokens: opts.maxTokens || 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  // content: [{ type: "text", text: "..." }]
  return (j.content || []).map((c: any) => c.text || '').join('');
}

async function callGemini(
  endpoint: string | null,
  model: string,
  apiKey: string,
  opts: CallOptions
): Promise<string> {
  const base = endpoint || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const parts: any[] = [];
  if (opts.system) parts.push({ text: '[SYSTEM]\n' + opts.system + '\n\n[USER]\n' + opts.user });
  else parts.push({ text: opts.user });
  const body: any = { contents: [{ parts }] };
  if (opts.responseFormat === 'json') {
    body.generationConfig = { responseMimeType: 'application/json' };
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return (j.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || '')
    .join('');
}

// ---------- AIレビュー用デフォルトプロンプト ----------

export const DEFAULT_REVIEW_PROMPT = `あなたは技術記事の編集者です。以下のMarkdown記事をレビューし、必ずJSONのみで回答してください。

出力スキーマ:
{
  "summary": "全体講評(2〜4文)",
  "goodPoints": ["良い点(箇条書き)", ...],
  "improvements": ["改善点(箇条書き)", ...],
  "lineComments": [
    { "line": <記事内の対象行番号(1始まり)>, "body": "その行に対する具体コメント" },
    ...
  ]
}

ルール:
- lineComments は必ず空配列ではなく、誤字脱字・助詞重複・不自然な日本語・事実誤認を中心に2〜10件程度含めること。
- line は記事本文(コードフェンス含む全体)の行番号で、ユーザーが該当行を見つけやすい数字を返す。
- 余計な前置きや markdown の \`\`\`json などは絶対に書かない。生のJSONのみを返す。`;

export const DEFAULT_SUMMARY_PROMPT = `あなたはテックブログの要約者です。以下の記事を、日本語で 200〜300字 でわかりやすく要約してください。
- 箇条書きにせず、自然な散文で書く
- 記事の主題と結論が伝わるようにする
- 余計な前置きをしない (本文のみを返す)`;
