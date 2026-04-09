import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';

export const aggregationRoutes = new Hono<{ Variables: { user: User | null } }>();

// テンプレート CRUD

aggregationRoutes.get('/templates', requireAuth, async (c) => {
  const me = c.get('user')!;
  const items = await prisma.aggregationTemplate.findMany({
    where: { userId: me.id },
    orderBy: { updatedAt: 'desc' },
  });
  return c.json(items);
});

aggregationRoutes.post('/templates', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { name, body } = await c.req.json<{ name: string; body: string }>();
  const created = await prisma.aggregationTemplate.create({
    data: {
      userId: me.id,
      name: String(name || 'untitled').slice(0, 60),
      body: String(body || '').slice(0, 8000),
    },
  });
  return c.json(created);
});

aggregationRoutes.put('/templates/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const t = await prisma.aggregationTemplate.findUnique({ where: { id } });
  if (!t || t.userId !== me.id) return c.json({ error: 'forbidden' }, 403);
  const { name, body } = await c.req.json<{ name: string; body: string }>();
  const updated = await prisma.aggregationTemplate.update({
    where: { id },
    data: { name: String(name).slice(0, 60), body: String(body).slice(0, 8000) },
  });
  return c.json(updated);
});

aggregationRoutes.delete('/templates/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const t = await prisma.aggregationTemplate.findUnique({ where: { id } });
  if (!t || t.userId !== me.id) return c.json({ error: 'forbidden' }, 403);
  await prisma.aggregationTemplate.delete({ where: { id } });
  return c.json({ ok: true });
});

// 集約 Markdown を生成
// {{articles}} を ${title}\nURL\n\n${summary?} の繰り返しに置換
aggregationRoutes.post('/render', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { templateId, body, articleIds, includeSummary } = await c.req.json<{
    templateId?: string;
    body?: string;
    articleIds: string[];
    includeSummary?: boolean;
  }>();

  let tplBody = body || '';
  if (templateId) {
    const t = await prisma.aggregationTemplate.findUnique({ where: { id: templateId } });
    if (t && t.userId === me.id) tplBody = t.body;
  }
  if (!tplBody) tplBody = '{{articles}}';

  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds || [] } },
  });
  const ordered = (articleIds || [])
    .map((id) => articles.find((a) => a.id === id))
    .filter(Boolean) as typeof articles;

  let summaries = new Map<string, string>();
  if (includeSummary) {
    const { callLLM, DEFAULT_SUMMARY_PROMPT } = await import('./ai');
    const promptRow = await prisma.userAIPrompt.findUnique({
      where: { userId_kind: { userId: me.id, kind: 'summary' } },
    });
    const system = promptRow?.body || DEFAULT_SUMMARY_PROMPT;
    for (const a of ordered) {
      try {
        const s = await callLLM(me.id, {
          system,
          user: `タイトル: ${a.title}\n\n本文:\n${a.body.slice(0, 8000)}`,
          maxTokens: 800,
        });
        summaries.set(a.id, s.trim());
      } catch (e: any) {
        summaries.set(a.id, `[要約失敗: ${e.message}]`);
      }
    }
  }

  // 記事 URL は origin 付きの絶対 URL にして、必ずクリック可能な
  // Markdown リンクとして出力する。タイトル自体をリンクに。
  const origin = c.req.header('origin') || c.req.header('host') ? `${c.req.header('origin') || 'http://' + c.req.header('host')}` : '';
  const blocks = ordered
    .map((a) => {
      const url = `${origin}/articles/${a.id}`;
      const summary = summaries.get(a.id);
      // 例: ## [タイトル](https://example.com/articles/xxx)
      return `## [${a.title}](${url})\n${summary ? '\n' + summary + '\n' : ''}`;
    })
    .join('\n');

  const md = tplBody.includes('{{articles}}') ? tplBody.replace(/\{\{articles\}\}/g, blocks) : tplBody + '\n\n' + blocks;
  return c.json({ markdown: md });
});
