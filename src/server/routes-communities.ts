import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';

export const communityRoutes = new Hono<{ Variables: { user: User | null } }>();

function slugify(name: string): string {
  const base = String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 40);
  return base || 'c-' + randomBytes(3).toString('hex');
}

async function requireOwner(communityId: string, userId: string) {
  const m = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId } },
  });
  if (!m || m.role !== 'owner') throw new Error('forbidden');
}

async function requireMember(communityId: string, userId: string) {
  const m = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId } },
  });
  if (!m) throw new Error('forbidden');
  return m;
}

// ---------- communities ----------

communityRoutes.get('/', async (c) => {
  const me = c.get('user');
  const all = await prisma.community.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true } } },
  });
  let myIds = new Set<string>();
  if (me) {
    const ms = await prisma.communityMember.findMany({ where: { userId: me.id } });
    myIds = new Set(ms.map((m) => m.communityId));
  }
  // private で非メンバーには返さない
  const visible = all.filter((c2) => c2.visibility === 'public' || myIds.has(c2.id));
  // 各コミュニティの owner 数を一括で取得
  const ownerRows = await prisma.communityMember.groupBy({
    by: ['communityId'],
    where: { role: 'owner', communityId: { in: visible.map((v) => v.id) } },
    _count: { _all: true },
  });
  const ownerCountMap = new Map(ownerRows.map((r) => [r.communityId, r._count._all]));
  return c.json(
    visible.map((c2) => ({
      id: c2.id,
      name: c2.name,
      slug: c2.slug,
      description: c2.description,
      avatarUrl: c2.avatarUrl,
      visibility: c2.visibility,
      memberCount: c2._count.members,
      ownerCount: ownerCountMap.get(c2.id) || 0,
      isMember: myIds.has(c2.id),
    }))
  );
});

communityRoutes.post('/', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { name, description, visibility } = await c.req.json<{
    name: string;
    description?: string;
    visibility?: string;
  }>();
  const trimmed = String(name || '').trim().slice(0, 60);
  if (!trimmed) return c.json({ error: 'name は必須です' }, 400);
  const vis = visibility === 'public' ? 'public' : 'private';
  // slug 衝突対策: 既存があればサフィックスを足す
  let slug = slugify(trimmed);
  const conflict = await prisma.community.findUnique({ where: { slug } });
  if (conflict) slug = slug + '-' + randomBytes(3).toString('hex');
  const created = await prisma.community.create({
    data: {
      name: trimmed,
      slug,
      visibility: vis,
      description: description ? String(description).slice(0, 500) : null,
      members: { create: { userId: me.id, role: 'owner' } },
      // 必ず「ホーム」TL を持つ
      timelines: { create: { name: 'ホーム', visibility: 'members_only' } },
    },
  });
  return c.json(created);
});

communityRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const community = await prisma.community.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      timelines: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!community) return c.json({ error: 'not found' }, 404);
  const myMember = me ? community.members.find((m) => m.userId === me.id) : null;
  // private community は非メンバーから完全に隠す (404)
  if (community.visibility === 'private' && !myMember) {
    return c.json({ error: 'not found' }, 404);
  }
  // 「ホーム」TL が無い旧データ救済 (auto heal)
  if (community.timelines.length === 0) {
    const home = await prisma.communityTimeline.create({
      data: { communityId: id, name: 'ホーム', visibility: 'members_only' },
    });
    community.timelines.push(home);
  }
  return c.json({
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description,
    avatarUrl: community.avatarUrl,
    visibility: community.visibility,
    members: community.members.map((m) => ({
      id: m.userId,
      role: m.role,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
    })),
    timelines: community.timelines,
    myRole: myMember?.role || null,
  });
});

communityRoutes.patch('/:id', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const { name, description, visibility, avatarUrl } = await c.req.json<{
    name?: string;
    description?: string;
    visibility?: string;
    avatarUrl?: string | null;
  }>();
  const updated = await prisma.community.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).slice(0, 60) } : {}),
      ...(description !== undefined ? { description: String(description).slice(0, 500) } : {}),
      ...(visibility === 'public' || visibility === 'private' ? { visibility } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
    },
  });
  return c.json(updated);
});

// ---------- join (public のみセルフ参加可) ----------

communityRoutes.post('/:id/join', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const community = await prisma.community.findUnique({ where: { id } });
  if (!community) return c.json({ error: 'コミュニティが見つかりません' }, 404);
  if (community.visibility !== 'public') {
    return c.json(
      { error: 'private_only', message: '非公開コミュニティへは招待リンクからのみ参加できます' },
      403
    );
  }
  // 既メンバーなら成功扱い
  const existing = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: me.id, communityId: id } },
  });
  if (existing) return c.json({ ok: true, already: true });
  await prisma.communityMember.create({
    data: { userId: me.id, communityId: id, role: 'member' },
  });
  return c.json({ ok: true });
});

// ---------- members ----------

// owner が任意のユーザを直接メンバーに追加する (招待リンクを介さない直接追加)
communityRoutes.post('/:id/members', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const { userId } = await c.req.json<{ userId: string }>();
  if (!userId) return c.json({ error: 'userId は必須です' }, 400);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: 'ユーザが見つかりません' }, 404);
  const existing = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId: id } },
  });
  if (existing) return c.json({ ok: true, already: true });
  await prisma.communityMember.create({
    data: { userId, communityId: id, role: 'member' },
  });
  // 過去の脱退ログがあれば消す
  await prisma.communityLeftLog.deleteMany({
    where: { userId, communityId: id },
  });
  return c.json({ ok: true });
});

communityRoutes.patch('/:id/members/:userId', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const targetUserId = c.req.param('userId');
  await requireOwner(id, me.id);
  const { role } = await c.req.json<{ role: 'owner' | 'member' }>();
  if (role !== 'owner' && role !== 'member')
    return c.json({ error: 'invalid role' }, 400);
  // 仕様変更: 「代表が最低1名必要」というガードは廃止。
  // 代表不在のコミュニティは UI 側で「代表者なし」と表示する。
  const updated = await prisma.communityMember.update({
    where: { userId_communityId: { userId: targetUserId, communityId: id } },
    data: { role },
  });
  return c.json(updated);
});

communityRoutes.delete('/:id/members/:userId', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const targetUserId = c.req.param('userId');
  if (targetUserId !== me.id) await requireOwner(id, me.id);
  const target = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: targetUserId, communityId: id } },
  });
  if (!target) return c.json({ error: 'not a member' }, 404);
  // 仕様変更: 最後の代表が脱退するのを許容する。
  // 代表不在になったコミュニティは「活動停止状態」として UI 側でラベル表示する。
  await prisma.communityMember.delete({
    where: { userId_communityId: { userId: targetUserId, communityId: id } },
  });
  // private コミュニティを脱退した場合、本人だけが見える left-log を残す
  // (一覧 API では非メンバーから隠れるので、ここに記録しないと再発見できなくなる)
  const community = await prisma.community.findUnique({ where: { id } });
  if (community?.visibility === 'private') {
    await prisma.communityLeftLog.upsert({
      where: { userId_communityId: { userId: targetUserId, communityId: id } },
      create: { userId: targetUserId, communityId: id },
      update: { leftAt: new Date() },
    });
  }
  return c.json({ ok: true });
});

// ---------- 自分が抜けた private コミュニティ (本人専用 / ページネーション付き) ----------

communityRoutes.get('/me/left-private', requireAuth, async (c) => {
  const me = c.get('user')!;
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10));
  const where = { userId: me.id, community: { visibility: 'private' as const } };
  const [total, rows] = await Promise.all([
    prisma.communityLeftLog.count({ where }),
    prisma.communityLeftLog.findMany({
      where,
      orderBy: { leftAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        community: {
          include: { _count: { select: { members: true } } },
        },
      },
    }),
  ]);
  const ownerRows = await prisma.communityMember.groupBy({
    by: ['communityId'],
    where: { role: 'owner', communityId: { in: rows.map((r) => r.communityId) } },
    _count: { _all: true },
  });
  const ownerMap = new Map(ownerRows.map((r) => [r.communityId, r._count._all]));
  return c.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((r) => ({
      id: r.community.id,
      name: r.community.name,
      slug: r.community.slug,
      description: r.community.description,
      avatarUrl: r.community.avatarUrl,
      visibility: r.community.visibility,
      memberCount: r.community._count.members,
      ownerCount: ownerMap.get(r.community.id) || 0,
      leftAt: r.leftAt,
    })),
  });
});

// 自分が以前抜けた private コミュニティへ「再参加」するための専用エンドポイント。
// 通常 private は招待リンク必須だが、left-log がある = 過去にメンバーだった人なので
// 本人都合で抜けた場合のリカバリとして直接戻れる。
communityRoutes.post('/:id/rejoin', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const log = await prisma.communityLeftLog.findUnique({
    where: { userId_communityId: { userId: me.id, communityId: id } },
  });
  if (!log) return c.json({ error: '再参加権限がありません (脱退履歴がありません)' }, 403);
  const community = await prisma.community.findUnique({ where: { id } });
  if (!community) return c.json({ error: 'コミュニティが見つかりません' }, 404);
  // 既に何らかの理由で再参加済みなら冪等成功
  const existing = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: me.id, communityId: id } },
  });
  if (!existing) {
    await prisma.communityMember.create({
      data: { userId: me.id, communityId: id, role: 'member' },
    });
  }
  await prisma.communityLeftLog.delete({
    where: { userId_communityId: { userId: me.id, communityId: id } },
  });
  return c.json({ ok: true });
});

// ---------- invites ----------

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日

communityRoutes.post('/:id/invites', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const { email } = await c.req.json<{ email?: string }>();
  const cleanEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  const token = randomBytes(20).toString('base64url');
  const inv = await prisma.communityInvite.create({
    data: {
      communityId: id,
      email: cleanEmail,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  return c.json({ id: inv.id, token: inv.token, expiresAt: inv.expiresAt });
});

communityRoutes.get('/:id/invites', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const invs = await prisma.communityInvite.findMany({
    where: { communityId: id },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(invs);
});

communityRoutes.delete('/:id/invites/:inviteId', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const inviteId = c.req.param('inviteId');
  await requireOwner(id, me.id);
  await prisma.communityInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });
  return c.json({ ok: true });
});

communityRoutes.post('/invites/accept', requireAuth, async (c) => {
  const me = c.get('user')!;
  const { token } = await c.req.json<{ token: string }>();
  const inv = await prisma.communityInvite.findUnique({ where: { token } });
  if (!inv) return c.json({ error: '招待が見つかりません' }, 404);
  if (inv.revokedAt) return c.json({ error: '招待は取り消されています' }, 400);
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
    return c.json({ error: '招待の有効期限が切れています' }, 400);
  }
  // 既存メンバーの場合は acceptedAt を更新せずにそのまま community に飛ばす
  const already = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: me.id, communityId: inv.communityId } },
  });
  if (already) {
    return c.json({ ok: true, communityId: inv.communityId, alreadyMember: true });
  }
  if (inv.acceptedAt) return c.json({ error: 'この招待は既に使用済みです' }, 400);
  await prisma.$transaction([
    prisma.communityMember.create({
      data: { userId: me.id, communityId: inv.communityId, role: 'member' },
    }),
    prisma.communityInvite.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    }),
    // 過去に脱退していた場合は left-log を消す
    prisma.communityLeftLog.deleteMany({
      where: { userId: me.id, communityId: inv.communityId },
    }),
  ]);
  return c.json({ ok: true, communityId: inv.communityId });
});

// ---------- timelines ----------

communityRoutes.post('/:id/timelines', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const { name, visibility, visibilityAffiliationIds } = await c.req.json<{
    name: string;
    visibility?: string;
    visibilityAffiliationIds?: string[];
  }>();
  const created = await prisma.communityTimeline.create({
    data: {
      communityId: id,
      name: String(name || 'タイムライン').slice(0, 40),
      visibility:
        visibility === 'public' || visibility === 'members_only' || visibility === 'affiliation_in'
          ? visibility
          : 'members_only',
      visibilityAffiliationIds: (visibilityAffiliationIds || []).join(','),
    },
  });
  return c.json(created);
});

communityRoutes.delete('/:id/timelines/:timelineId', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const tlId = c.req.param('timelineId');
  await requireOwner(id, me.id);
  // 「ホーム」(=各 community で最初に作られた TL) は削除不可
  const tl = await prisma.communityTimeline.findUnique({ where: { id: tlId } });
  if (!tl || tl.communityId !== id) return c.json({ error: 'not found' }, 404);
  if (tl.name === 'ホーム') {
    return c.json({ error: 'home_protected', message: 'ホームタイムラインは削除できません。' }, 400);
  }
  // 削除する TL に紐付く記事は home に振り戻す
  const home = await prisma.communityTimeline.findFirst({
    where: { communityId: id, name: 'ホーム' },
  });
  if (home) {
    await prisma.article.updateMany({
      where: { timelineId: tlId },
      data: { timelineId: home.id },
    });
  }
  await prisma.communityTimeline.delete({ where: { id: tlId } });
  return c.json({ ok: true });
});

// タイムラインの記事一覧 (visibilityチェック付き)
communityRoutes.get('/:id/timelines/:timelineId/articles', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const tlId = c.req.param('timelineId');
  const tl = await prisma.communityTimeline.findUnique({ where: { id: tlId } });
  if (!tl || tl.communityId !== id) return c.json({ error: 'not found' }, 404);

  // visibility チェック
  if (tl.visibility === 'members_only') {
    if (!me) return c.json({ error: 'forbidden' }, 403);
    const m = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: me.id, communityId: id } },
    });
    if (!m) return c.json({ error: 'forbidden' }, 403);
  } else if (tl.visibility === 'affiliation_in') {
    if (!me) return c.json({ error: 'forbidden' }, 403);
    const myAffs = await prisma.userAffiliation.findMany({ where: { userId: me.id } });
    const allowed = new Set((tl.visibilityAffiliationIds || '').split(',').filter(Boolean));
    if (!myAffs.some((a) => allowed.has(a.affiliationId))) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }

  // ホーム TL は timelineId 未指定の community 記事も含める (旧データ救済 + 自動振り分け)
  const isHome = tl.name === 'ホーム';
  const articles = await prisma.article.findMany({
    where: {
      published: true,
      approvalStatus: 'approved',
      ...(isHome
        ? { communityId: id, OR: [{ timelineId: tlId }, { timelineId: null }] }
        : { timelineId: tlId }),
    },
    orderBy: [{ publishedAt: 'desc' }],
    select: {
      id: true,
      authorId: true,
      title: true,
      emoji: true,
      type: true,
      publishedAt: true,
      createdAt: true,
      author: { select: { id: true, name: true, avatarUrl: true } },
      topics: { select: { topic: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { likes: true, bookmarks: true } },
    },
  });
  return c.json(
    articles.map((a) => ({
      ...a,
      topics: a.topics.map((t) => t.topic),
      likeCount: a._count.likes,
      bookmarkCount: a._count.bookmarks,
    }))
  );
});

// 承認待ち一覧 (owner専用)
communityRoutes.get('/:id/pending', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  await requireOwner(id, me.id);
  const articles = await prisma.article.findMany({
    where: { communityId: id, approvalStatus: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return c.json(articles);
});

communityRoutes.post('/:id/pending/:articleId/approve', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const articleId = c.req.param('articleId');
  await requireOwner(id, me.id);
  const a = await prisma.article.update({
    where: { id: articleId },
    data: { approvalStatus: 'approved', published: true, publishedAt: new Date() },
  });
  return c.json(a);
});

communityRoutes.post('/:id/pending/:articleId/reject', requireAuth, async (c) => {
  const me = c.get('user')!;
  const id = c.req.param('id');
  const articleId = c.req.param('articleId');
  await requireOwner(id, me.id);
  const { note } = await c.req.json<{ note?: string }>();
  const a = await prisma.article.update({
    where: { id: articleId },
    data: { approvalStatus: 'rejected', approvalNote: note || null },
  });
  return c.json(a);
});
