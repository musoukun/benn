import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { filterByVisibility } from './routes';

export const searchRoutes = new Hono<{ Variables: { user: User | null } }>();

// 統合検索: ?q=... &type=article|community|post (デフォルト article)
// SQLite なので contains で素朴に絞る (後で FTS 化する余地)
searchRoutes.get('/', async (c) => {
  const me = c.get('user');
  const q = (c.req.query('q') || '').trim();
  const type = c.req.query('type') || 'article';
  if (!q) return c.json({ items: [] });

  if (type === 'article') {
    const items = await prisma.article.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: q } },
          { body: { contains: q } },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        emoji: true,
        type: true,
        publishedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
        topics: { select: { topic: { select: { id: true, name: true, slug: true } } } },
        _count: { select: { likes: true } },
        visibility: true,
        visibilityAffiliationIds: true,
        authorId: true,
        communityId: true,
      },
    });
    // visibility フィルタ (friends_only / community 記事)
    const filtered = await filterByVisibility(items as any, me?.id || null);
    return c.json({
      items: filtered.map((a: any) => ({
        id: a.id,
        title: a.title,
        emoji: a.emoji,
        type: a.type,
        publishedAt: a.publishedAt,
        author: a.author,
        topics: a.topics.map((t: any) => t.topic),
        likeCount: a._count.likes,
      })),
    });
  }

  if (type === 'community') {
    const all = await prisma.community.findMany({
      where: {
        OR: [{ name: { contains: q } }, { description: { contains: q } }],
      },
      include: { _count: { select: { members: true } } },
      take: 30,
    });
    let myIds = new Set<string>();
    let myAffIds = new Set<string>();
    if (me) {
      const ms = await prisma.communityMember.findMany({ where: { userId: me.id } });
      myIds = new Set(ms.map((m) => m.communityId));
      const affs = await prisma.userAffiliation.findMany({
        where: { userId: me.id },
        select: { affiliationId: true },
      });
      myAffIds = new Set(affs.map((a) => a.affiliationId));
    }
    // private / affiliation_* で見えないコミュニティは返さない
    const visible = all.filter((c2) => {
      if (myIds.has(c2.id)) return true;
      if (c2.visibility === 'public') return true;
      if (c2.visibility === 'private') return false;
      const ids = (c2.visibilityAffiliationIds || '').split(',').filter(Boolean);
      if (c2.visibility === 'affiliation_in') {
        return ids.some((id) => myAffIds.has(id));
      }
      if (c2.visibility === 'affiliation_out') {
        return !ids.some((id) => myAffIds.has(id));
      }
      return false;
    });
    return c.json({
      items: visible.map((c2) => ({
        id: c2.id,
        name: c2.name,
        slug: c2.slug,
        description: c2.description,
        visibility: c2.visibility,
        memberCount: c2._count.members,
        isMember: myIds.has(c2.id),
      })),
    });
  }

  if (type === 'user') {
    if (!me) return c.json({ items: [] });
    const items = await prisma.user.findMany({
      where: {
        OR: [{ name: { contains: q } }, { email: { contains: q } }],
      },
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, avatarUrl: true, bio: true },
    });
    return c.json({ items });
  }

  if (type === 'post') {
    // 自分が所属している community の post のみ検索可
    if (!me) return c.json({ items: [] });
    const ms = await prisma.communityMember.findMany({
      where: { userId: me.id },
      select: { communityId: true },
    });
    const communityIds = ms.map((m) => m.communityId);
    if (communityIds.length === 0) return c.json({ items: [] });
    const items = await prisma.post.findMany({
      where: {
        communityId: { in: communityIds },
        approvalStatus: 'approved',
        body: { contains: q },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        community: { select: { id: true, name: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    return c.json({
      items: items.map((p) => ({
        id: p.id,
        body: p.body,
        author: p.author,
        community: p.community,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        createdAt: p.createdAt,
      })),
    });
  }

  return c.json({ items: [] });
});
