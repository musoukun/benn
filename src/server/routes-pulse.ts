import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';

export const pulseRoutes = new Hono<{ Variables: { user: User | null } }>();

// ============================================================
// パルスサーベイ定数
// ============================================================

/** 7次元 x 15問 — 組織健全性サーベイ */
export const PULSE_QUESTIONS = [
  // direction (方向性)
  { id: 'q1', dimension: 'direction', text: '自社が今期何を達成しようとしているか、自分の言葉で説明できる' },
  { id: 'q2', dimension: 'direction', text: '経営層の意思決定に一貫性があり、途中で理由なく覆ることが少ない' },
  // alignment (利害調整)
  { id: 'q3', dimension: 'alignment', text: '部門間の利害調整に無駄な時間を取られていない' },
  { id: 'q4', dimension: 'alignment', text: '営業・開発・現場の間で優先順位が共有されている' },
  // fairness (公正さ)
  { id: 'q5', dimension: 'fairness', text: '評価や処遇の基準が事前に明示されており、結果に納得感がある' },
  { id: 'q6', dimension: 'fairness', text: '成果を出した人が正当に報われ、問題ある行動は是正されている' },
  // leadership (管理職)
  { id: 'q7', dimension: 'leadership', text: '上司は提案や報告の中身を理解した上で判断している' },
  { id: 'q8', dimension: 'leadership', text: '上司に反対意見を伝えても、報復や不利益を受けない' },
  // execution (実行力)
  { id: 'q9', dimension: 'execution', text: '現在のボトルネックがチーム内で特定・共有されている' },
  { id: 'q10', dimension: 'execution', text: 'ボトルネックに対する改善策が実行に移されている' },
  // value (バリュー浸透)
  { id: 'q11', dimension: 'value', text: '判断に迷ったとき、会社のバリューや行動指針が意思決定の基準になっている' },
  { id: 'q12', dimension: 'value', text: '事業として前に進んでいる実感がある' },
  // safety (心理的安全性)
  { id: 'q13', dimension: 'safety', text: '自分の専門性や強みを活かせる業務にアサインされている' },
  { id: 'q14', dimension: 'safety', text: '現状が厳しくても、立て直しの戦略が存在し、そこに向かって動けている' },
  { id: 'q15', dimension: 'safety', text: '仕事の負荷は適切で、来週も前向きに取り組めそうだ' },
] as const;

const QUESTION_IDS = PULSE_QUESTIONS.map((q) => q.id);
const DIMENSIONS = ['direction', 'alignment', 'fairness', 'leadership', 'execution', 'value', 'safety'] as const;

// ============================================================
// ヘルパー
// ============================================================

/** ユーザーが所属に属しているか確認 */
async function requireAffiliationMember(affiliationId: string, userId: string) {
  const m = await prisma.userAffiliation.findUnique({
    where: { userId_affiliationId: { userId, affiliationId } },
  });
  if (!m) throw new Error('forbidden');
}

/** 管理者チェック */
function requireAdmin(user: User) {
  if (!user.isAdmin) throw new Error('forbidden');
}

function getISOWeek(d: Date): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `weekly_${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 集計ロジック (10点満点)
 * - 各質問の平均 (1-5 raw) を算出
 * - 次元スコア = 次元内質問の平均 × 2 (0-10)
 * - 総合スコア = 全質問の平均 × 2 (0-10)
 */
function computeAggregates(responses: { answers: string }[]) {
  if (responses.length === 0) {
    const zeros: Record<string, number> = {};
    QUESTION_IDS.forEach((id) => (zeros[id] = 0));
    const dimZeros: Record<string, number> = {};
    DIMENSIONS.forEach((d) => (dimZeros[d] = 0));
    return { averages: zeros, dimensions: dimZeros, overall: 0 };
  }

  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  QUESTION_IDS.forEach((id) => { sums[id] = 0; counts[id] = 0; });

  for (const r of responses) {
    const ans = JSON.parse(r.answers) as Record<string, number>;
    for (const id of QUESTION_IDS) {
      if (typeof ans[id] === 'number') {
        sums[id] += ans[id];
        counts[id] += 1;
      }
    }
  }

  // 質問別平均 (raw 1-5)
  const averages: Record<string, number> = {};
  QUESTION_IDS.forEach((id) => {
    averages[id] = counts[id] > 0 ? Math.round((sums[id] / counts[id]) * 100) / 100 : 0;
  });

  // 次元スコア (10点満点 = raw平均 × 2)
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const dimensions: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    const qs = PULSE_QUESTIONS.filter((q) => q.dimension === dim);
    const dimAvgs = qs.map((q) => averages[q.id]).filter((v) => v > 0);
    dimensions[dim] = dimAvgs.length > 0
      ? round1((dimAvgs.reduce((a, b) => a + b, 0) / dimAvgs.length) * 2)
      : 0;
  }

  // 総合スコア (10点満点)
  const allAvgs = QUESTION_IDS.map((id) => averages[id]).filter((v) => v > 0);
  const overall = allAvgs.length > 0
    ? round1((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 2)
    : 0;

  return { averages, dimensions, overall };
}

// ============================================================
// 所属スコープのエンドポイント
// ============================================================

/** GET /pulse/affiliations/:affiliationId — サーベイ一覧 */
pulseRoutes.get('/affiliations/:affiliationId', requireAuth, async (c) => {
  const user = c.var.user!;
  const { affiliationId } = c.req.param();
  await requireAffiliationMember(affiliationId, user.id);

  const limit = Math.min(Number(c.req.query('limit')) || 20, 50);
  const offset = Number(c.req.query('offset')) || 0;
  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId } });

  const surveys = await prisma.pulseSurvey.findMany({
    where: { affiliationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: { _count: { select: { responses: true } } },
  });

  return c.json(
    surveys.map((s) => ({
      id: s.id,
      affiliationId: s.affiliationId,
      periodLabel: s.periodLabel,
      status: s.status,
      responseCount: s._count.responses,
      memberCount,
      opensAt: s.opensAt.toISOString(),
      closesAt: s.closesAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

/** GET /pulse/affiliations/:affiliationId/current — 現在 open のサーベイ */
pulseRoutes.get('/affiliations/:affiliationId/current', requireAuth, async (c) => {
  const user = c.var.user!;
  const { affiliationId } = c.req.param();
  await requireAffiliationMember(affiliationId, user.id);

  const survey = await prisma.pulseSurvey.findFirst({
    where: { affiliationId, status: 'open' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { responses: true } } },
  });
  if (!survey) return c.json(null);

  const myResponse = await prisma.pulseSurveyResponse.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: user.id } },
  });
  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId } });

  return c.json({
    id: survey.id,
    affiliationId: survey.affiliationId,
    periodLabel: survey.periodLabel,
    status: survey.status,
    responseCount: survey._count.responses,
    memberCount,
    opensAt: survey.opensAt.toISOString(),
    closesAt: survey.closesAt.toISOString(),
    myResponseExists: !!myResponse,
  });
});

/** POST /pulse/affiliations/:affiliationId — サーベイ作成 (管理者のみ) */
pulseRoutes.post('/affiliations/:affiliationId', requireAuth, async (c) => {
  const user = c.var.user!;
  requireAdmin(user);
  const { affiliationId } = c.req.param();

  // 所属が存在するか確認
  const aff = await prisma.affiliation.findUnique({ where: { id: affiliationId } });
  if (!aff) return c.json({ error: '所属が見つかりません' }, 404);

  const now = new Date();
  const periodLabel = getISOWeek(now);
  const closesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.pulseSurvey.findUnique({
    where: { affiliationId_periodLabel: { affiliationId, periodLabel } },
  });
  if (existing) {
    return c.json({ error: 'この週のサーベイは既に存在します', existingId: existing.id }, 409);
  }

  const survey = await prisma.pulseSurvey.create({
    data: { affiliationId, createdById: user.id, periodLabel, closesAt },
  });
  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId } });

  return c.json({
    id: survey.id,
    affiliationId,
    periodLabel: survey.periodLabel,
    status: survey.status,
    responseCount: 0,
    memberCount,
    opensAt: survey.opensAt.toISOString(),
    closesAt: survey.closesAt.toISOString(),
    createdAt: survey.createdAt.toISOString(),
  }, 201);
});

/** GET /pulse/surveys/:id — サーベイ詳細 + 所属全体の集計結果 */
pulseRoutes.get('/surveys/:id', requireAuth, async (c) => {
  const user = c.var.user!;
  const { id } = c.req.param();

  const survey = await prisma.pulseSurvey.findUnique({
    where: { id },
    include: {
      responses: { select: { answers: true } },
      _count: { select: { responses: true } },
      affiliation: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!survey) return c.json({ error: 'not found' }, 404);

  await requireAffiliationMember(survey.affiliationId, user.id);
  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId: survey.affiliationId } });

  const myResponse = await prisma.pulseSurveyResponse.findUnique({
    where: { surveyId_userId: { surveyId: id, userId: user.id } },
  });

  const { averages, dimensions, overall } = computeAggregates(survey.responses);

  return c.json({
    id: survey.id,
    affiliationId: survey.affiliationId,
    affiliationName: survey.affiliation.name,
    periodLabel: survey.periodLabel,
    status: survey.status,
    responseCount: survey._count.responses,
    memberCount,
    opensAt: survey.opensAt.toISOString(),
    closesAt: survey.closesAt.toISOString(),
    averages,
    dimensions,
    overall,
    myResponseExists: !!myResponse,
  });
});

/** POST /pulse/surveys/:id/respond — 回答送信 (upsert) */
pulseRoutes.post('/surveys/:id/respond', requireAuth, async (c) => {
  const user = c.var.user!;
  const { id } = c.req.param();

  const survey = await prisma.pulseSurvey.findUnique({ where: { id } });
  if (!survey) return c.json({ error: 'not found' }, 404);
  if (survey.status !== 'open') return c.json({ error: 'このサーベイは終了しています' }, 400);

  await requireAffiliationMember(survey.affiliationId, user.id);

  const body = await c.req.json<{ answers: Record<string, number>; comment?: string }>();

  for (const qid of QUESTION_IDS) {
    const v = body.answers[qid];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      return c.json({ error: `${qid} は 1-5 の整数で入力してください` }, 400);
    }
  }

  if (body.comment && typeof body.comment === 'string' && body.comment.length > 500) {
    return c.json({ error: 'コメントは500文字以内で入力してください' }, 400);
  }

  const answersJson: Record<string, number | string> = {};
  for (const qid of QUESTION_IDS) answersJson[qid] = body.answers[qid];
  if (body.comment) answersJson.comment = body.comment;

  await prisma.pulseSurveyResponse.upsert({
    where: { surveyId_userId: { surveyId: id, userId: user.id } },
    create: { surveyId: id, userId: user.id, answers: JSON.stringify(answersJson) },
    update: { answers: JSON.stringify(answersJson) },
  });

  // ストリーク: この所属で連続回答した週数
  const closedSurveys = await prisma.pulseSurvey.findMany({
    where: { affiliationId: survey.affiliationId, status: 'closed' },
    orderBy: { createdAt: 'desc' },
    take: 52,
    select: { id: true },
  });

  let streak = 1;
  for (const s of closedSurveys) {
    const resp = await prisma.pulseSurveyResponse.findUnique({
      where: { surveyId_userId: { surveyId: s.id, userId: user.id } },
    });
    if (resp) streak++;
    else break;
  }

  return c.json({ ok: true, streak });
});

/** GET /pulse/affiliations/:affiliationId/trends — 所属全体のトレンド */
pulseRoutes.get('/affiliations/:affiliationId/trends', requireAuth, async (c) => {
  const user = c.var.user!;
  const { affiliationId } = c.req.param();
  await requireAffiliationMember(affiliationId, user.id);

  const limit = Math.min(Number(c.req.query('limit')) || 12, 52);
  const surveys = await prisma.pulseSurvey.findMany({
    where: { affiliationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      responses: { select: { answers: true } },
      _count: { select: { responses: true } },
    },
  });

  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId } });

  return c.json(
    surveys.map((s) => {
      const { dimensions, overall } = computeAggregates(s.responses);
      return {
        periodLabel: s.periodLabel,
        dimensions,
        overall,
        responseRate: memberCount > 0 ? Math.round((s._count.responses / memberCount) * 100) : 0,
        responseCount: s._count.responses,
      };
    })
  );
});

/** PATCH /pulse/surveys/:id/close — サーベイクローズ (管理者のみ) */
pulseRoutes.patch('/surveys/:id/close', requireAuth, async (c) => {
  const user = c.var.user!;
  requireAdmin(user);
  const { id } = c.req.param();

  const survey = await prisma.pulseSurvey.findUnique({ where: { id } });
  if (!survey) return c.json({ error: 'not found' }, 404);
  if (survey.status === 'closed') return c.json({ error: '既にクローズされています' }, 400);

  await prisma.pulseSurvey.update({ where: { id }, data: { status: 'closed' } });
  return c.json({ ok: true });
});

// ============================================================
// 個人スコープのエンドポイント
// ============================================================

/** GET /pulse/me/current — 自分の未回答サーベイ一覧 (全所属横断) */
pulseRoutes.get('/me/current', requireAuth, async (c) => {
  const user = c.var.user!;

  // 自分の所属一覧
  const myAffs = await prisma.userAffiliation.findMany({
    where: { userId: user.id },
    select: { affiliationId: true, affiliation: { select: { id: true, name: true, slug: true } } },
  });

  if (myAffs.length === 0) return c.json([]);

  const affIds = myAffs.map((a) => a.affiliationId);

  // 全所属の open サーベイを取得
  const openSurveys = await prisma.pulseSurvey.findMany({
    where: { affiliationId: { in: affIds }, status: 'open' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { responses: true } } },
  });

  // 自分が既に回答したサーベイ ID を取得
  const myResponses = await prisma.pulseSurveyResponse.findMany({
    where: { userId: user.id, surveyId: { in: openSurveys.map((s) => s.id) } },
    select: { surveyId: true },
  });
  const respondedSet = new Set(myResponses.map((r) => r.surveyId));

  // 所属メンバー数をまとめて取得
  const memberCounts = await prisma.userAffiliation.groupBy({
    by: ['affiliationId'],
    where: { affiliationId: { in: affIds } },
    _count: { _all: true },
  });
  const memberCountMap = new Map(memberCounts.map((r) => [r.affiliationId, r._count._all]));

  const affMap = new Map(myAffs.map((a) => [a.affiliationId, a.affiliation]));

  return c.json(
    openSurveys.map((s) => ({
      id: s.id,
      affiliationId: s.affiliationId,
      affiliationName: affMap.get(s.affiliationId)?.name || '',
      periodLabel: s.periodLabel,
      status: s.status,
      responseCount: s._count.responses,
      memberCount: memberCountMap.get(s.affiliationId) || 0,
      opensAt: s.opensAt.toISOString(),
      closesAt: s.closesAt.toISOString(),
      myResponseExists: respondedSet.has(s.id),
    }))
  );
});

/** GET /pulse/me/trends — 個人トレンド (全所属横断の自分の回答) */
pulseRoutes.get('/me/trends', requireAuth, async (c) => {
  const user = c.var.user!;
  const limit = Math.min(Number(c.req.query('limit')) || 24, 52);

  // 自分の回答を新しい順に取得
  const responses = await prisma.pulseSurveyResponse.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      survey: {
        select: { periodLabel: true, affiliationId: true, affiliation: { select: { name: true } } },
      },
    },
  });

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return c.json(
    responses.map((r) => {
      const ans = JSON.parse(r.answers) as Record<string, number>;
      const dimensions: Record<string, number> = {};
      for (const dim of DIMENSIONS) {
        const qs = PULSE_QUESTIONS.filter((q) => q.dimension === dim);
        const vals = qs.map((q) => ans[q.id]).filter((v) => typeof v === 'number');
        dimensions[dim] = vals.length > 0
          ? round1((vals.reduce((a, b) => a + b, 0) / vals.length) * 2)
          : 0;
      }
      const allVals = QUESTION_IDS.map((id) => ans[id]).filter((v) => typeof v === 'number');
      const overall = allVals.length > 0
        ? round1((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 2)
        : 0;
      return {
        periodLabel: r.survey.periodLabel,
        affiliationName: r.survey.affiliation.name,
        dimensions,
        overall,
        createdAt: r.createdAt.toISOString(),
      };
    })
  );
});

/** GET /pulse/affiliations/:affiliationId/monthly — 月次集計トレンド */
pulseRoutes.get('/affiliations/:affiliationId/monthly', requireAuth, async (c) => {
  const user = c.var.user!;
  const { affiliationId } = c.req.param();
  await requireAffiliationMember(affiliationId, user.id);

  const limit = Math.min(Number(c.req.query('limit')) || 12, 24);

  // 全サーベイを取得
  const surveys = await prisma.pulseSurvey.findMany({
    where: { affiliationId },
    orderBy: { createdAt: 'asc' },
    include: {
      responses: { select: { answers: true } },
      _count: { select: { responses: true } },
    },
  });

  const memberCount = await prisma.userAffiliation.count({ where: { affiliationId } });

  // 月別にグルーピング (periodLabel "weekly_2026-W16" → "2026-04" のように変換)
  const monthMap = new Map<string, typeof surveys>();
  for (const s of surveys) {
    // periodLabel → 月を推定: opensAt の月を使う
    const month = s.opensAt.toISOString().slice(0, 7); // "2026-04"
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(s);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([month, monthSurveys]) => {
      // 月内の全回答をまとめて集計
      const allResponses = monthSurveys.flatMap((s) => s.responses);
      const { dimensions, overall } = computeAggregates(allResponses);
      const totalResponses = monthSurveys.reduce((acc, s) => acc + s._count.responses, 0);
      const totalPossible = monthSurveys.length * memberCount;
      return {
        month,
        weekCount: monthSurveys.length,
        dimensions,
        overall,
        responseRate: totalPossible > 0 ? Math.round((totalResponses / totalPossible) * 100) : 0,
        responseCount: totalResponses,
      };
    });

  return c.json(months);
});
