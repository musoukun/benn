import { prisma } from './db';

let started = false;

// 1分ごとに scheduledAt を超えた未公開記事を公開する
export function startScheduler() {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const now = new Date();
      const due = await prisma.article.findMany({
        where: {
          published: false,
          scheduledAt: { lte: now, not: null },
          approvalStatus: { in: ['approved', 'draft'] },
        },
        select: { id: true },
      });
      if (due.length === 0) return;
      for (const a of due) {
        await prisma.article.update({
          where: { id: a.id },
          data: { published: true, publishedAt: now, approvalStatus: 'approved' },
        });
      }
      console.log(`[scheduler] published ${due.length} scheduled article(s)`);

      // パルスサーベイの自動クローズ (closesAt を過ぎた open サーベイ)
      const expired = await prisma.pulseSurvey.updateMany({
        where: { status: 'open', closesAt: { lte: now } },
        data: { status: 'closed' },
      });
      if (expired.count > 0) {
        console.log(`[scheduler] closed ${expired.count} expired pulse survey(s)`);
      }
    } catch (e) {
      console.error('[scheduler] error', e);
    }
  };
  // 起動直後に1回打って、その後60秒おき
  tick();
  setInterval(tick, 60_000);
}
