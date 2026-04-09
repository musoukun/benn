import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';

export const affiliationRoutes = new Hono<{ Variables: { user: User | null } }>();

function slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 40);
}

// 一覧
affiliationRoutes.get('/', async (c) => {
  const items = await prisma.affiliation.findMany({ orderBy: { createdAt: 'asc' } });
  return c.json(items);
});

// 作成 (誰でも可、既存があれば返す)
affiliationRoutes.post('/', requireAuth, async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) return c.json({ error: 'name は必須です' }, 400);
  const slug = slugify(trimmed) || 'team';
  const existing = await prisma.affiliation.findFirst({
    where: { OR: [{ name: trimmed }, { slug }] },
  });
  if (existing) return c.json(existing);
  const created = await prisma.affiliation.create({ data: { name: trimmed, slug } });
  return c.json(created);
});

// ユーザーの所属を取得
affiliationRoutes.get('/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  const links = await prisma.userAffiliation.findMany({
    where: { userId },
    include: { affiliation: true },
  });
  return c.json(links.map((l) => l.affiliation));
});

// 自分の所属を更新 (置換)
affiliationRoutes.put('/me', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { affiliationIds } = await c.req.json<{ affiliationIds: string[] }>();
  const ids = (affiliationIds || []).slice(0, 20);
  await prisma.userAffiliation.deleteMany({ where: { userId: me.id } });
  if (ids.length > 0) {
    await prisma.userAffiliation.createMany({
      data: ids.map((aid) => ({ userId: me.id, affiliationId: aid })),
    });
  }
  const items = await prisma.userAffiliation.findMany({
    where: { userId: me.id },
    include: { affiliation: true },
  });
  return c.json(items.map((l) => l.affiliation));
});
