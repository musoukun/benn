import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { encryptSecret, maskKey, decryptSecret } from './crypto';
import { callLLM, DEFAULT_REVIEW_PROMPT, DEFAULT_SUMMARY_PROMPT } from './ai';

export const aiRoutes = new Hono<{ Variables: { user: User | null } }>();

// ---------- AI provider configs ----------

aiRoutes.get('/configs', requireAuth, async (c) => {
  const me = c.get('user')!;
  const items = await prisma.userAIConfig.findMany({
    where: { userId: me.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return c.json(
    items.map((it) => ({
      id: it.id,
      provider: it.provider,
      endpoint: it.endpoint,
      model: it.model,
      isDefault: it.isDefault,
      apiKeyMasked: maskKey(safeDecrypt(it.apiKeyEnc)),
    }))
  );
});

function safeDecrypt(enc: string): string {
  try {
    return decryptSecret(enc);
  } catch {
    return '';
  }
}

aiRoutes.post('/configs', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { provider, endpoint, model, apiKey, isDefault } = await c.req.json<{
    provider: 'openai' | 'anthropic' | 'gemini';
    endpoint?: string;
    model: string;
    apiKey: string;
    isDefault?: boolean;
  }>();
  if (!['openai', 'anthropic', 'gemini'].includes(provider))
    return c.json({ error: 'invalid provider' }, 400);
  if (!apiKey || !model) return c.json({ error: 'apiKey と model は必須です' }, 400);
  const enc = encryptSecret(apiKey);
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.userAIConfig.updateMany({
        where: { userId: me.id },
        data: { isDefault: false },
      });
    }
    return tx.userAIConfig.create({
      data: {
        userId: me.id,
        provider,
        endpoint: endpoint || null,
        model,
        apiKeyEnc: enc,
        isDefault: !!isDefault,
      },
    });
  });
  return c.json({ id: created.id });
});

aiRoutes.delete('/configs/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const item = await prisma.userAIConfig.findUnique({ where: { id } });
  if (!item || item.userId !== me.id) return c.json({ error: 'forbidden' }, 403);
  await prisma.userAIConfig.delete({ where: { id } });
  return c.json({ ok: true });
});

aiRoutes.post('/configs/:id/default', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const item = await prisma.userAIConfig.findUnique({ where: { id } });
  if (!item || item.userId !== me.id) return c.json({ error: 'forbidden' }, 403);
  await prisma.$transaction([
    prisma.userAIConfig.updateMany({ where: { userId: me.id }, data: { isDefault: false } }),
    prisma.userAIConfig.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return c.json({ ok: true });
});

// ---------- Prompts ----------

aiRoutes.get('/prompts', requireAuth, async (c) => {
  const me = c.get('user')!;
  const items = await prisma.userAIPrompt.findMany({ where: { userId: me.id } });
  const map = Object.fromEntries(items.map((it) => [it.kind, it.body]));
  return c.json({
    review: map.review || DEFAULT_REVIEW_PROMPT,
    summary: map.summary || DEFAULT_SUMMARY_PROMPT,
  });
});

aiRoutes.put('/prompts/:kind', requireAuth, async (c) => {
  const me = c.get('user')!;
  const kind = c.req.param('kind');
  if (kind !== 'review' && kind !== 'summary')
    return c.json({ error: 'invalid kind' }, 400);
  const { body } = await c.req.json<{ body: string }>();
  await prisma.userAIPrompt.upsert({
    where: { userId_kind: { userId: me.id, kind } },
    update: { body: String(body || '').slice(0, 8000) },
    create: { userId: me.id, kind, body: String(body || '').slice(0, 8000) },
  });
  return c.json({ ok: true });
});

// ---------- AI レビュー ----------

aiRoutes.post('/articles/:id/review', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return c.json({ error: 'not found' }, 404);
  const promptRow = await prisma.userAIPrompt.findUnique({
    where: { userId_kind: { userId: me.id, kind: 'review' } },
  });
  const system = promptRow?.body || DEFAULT_REVIEW_PROMPT;

  // 行番号付きの記事本文
  const numbered = a.body
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4, ' ')}    ${line}`)
    .join('\n');
  const userMsg = `タイトル: ${a.title}\n\n本文 (行番号付き):\n${numbered}`;

  const raw = await callLLM(me.id, {
    system,
    user: userMsg,
    responseFormat: 'json',
    maxTokens: 4096,
  });

  let parsed: any;
  try {
    // JSON モードを無視するモデル対策で ```json``` を除去
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { summary: raw, goodPoints: [], improvements: [], lineComments: [] };
  }

  const saved = await prisma.articleReview.create({
    data: {
      articleId: id,
      userId: me.id,
      payload: JSON.stringify(parsed),
    },
  });
  return c.json({ id: saved.id, ...parsed });
});

aiRoutes.get('/articles/:id/reviews', async (c) => {
  const id = c.req.param('id');
  const items = await prisma.articleReview.findMany({
    where: { articleId: id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return c.json(
    items.map((it) => ({
      id: it.id,
      createdAt: it.createdAt,
      user: it.user,
      ...JSON.parse(it.payload),
    }))
  );
});

// ---------- 要約 ----------

aiRoutes.post('/summarize', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { articleIds, customPrompt } = await c.req.json<{
    articleIds: string[];
    customPrompt?: string;
  }>();
  const ids = (articleIds || []).slice(0, 20);
  if (ids.length === 0) return c.json({ items: [] });
  const promptRow = await prisma.userAIPrompt.findUnique({
    where: { userId_kind: { userId: me.id, kind: 'summary' } },
  });
  const system = customPrompt || promptRow?.body || DEFAULT_SUMMARY_PROMPT;

  const articles = await prisma.article.findMany({ where: { id: { in: ids } } });
  const byId = new Map(articles.map((a) => [a.id, a]));

  const results: { id: string; title: string; url: string; summary: string }[] = [];
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) continue;
    try {
      const summary = await callLLM(me.id, {
        system,
        user: `タイトル: ${a.title}\n\n本文:\n${a.body.slice(0, 8000)}`,
        maxTokens: 800,
      });
      results.push({
        id: a.id,
        title: a.title,
        url: `/articles/${a.id}`,
        summary: summary.trim(),
      });
    } catch (e: any) {
      results.push({
        id: a.id,
        title: a.title,
        url: `/articles/${a.id}`,
        summary: `[要約失敗: ${e.message}]`,
      });
    }
  }
  return c.json({ items: results });
});
