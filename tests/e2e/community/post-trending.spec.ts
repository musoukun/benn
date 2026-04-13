import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// E2E: コミュニティ投稿トレンド
// - コミュニティを作成し、複数投稿 + いいねを付ける
// - トレンド API がいいね数順で返すことを検証
// - UI のトレンドタブに表示されることを検証

const SHOTS_DIR = path.join(process.cwd(), 'screenshots', 'post-trending');

let _i = 0;
function shotPath(name: string) {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  _i++;
  return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${name}.png`);
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

async function reg(ctx: BrowserContext, prefix: string) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
  return { page, email, name };
}

test.describe('コミュニティ投稿トレンド', () => {
  test.setTimeout(120_000);

  test('いいね数順でトレンドに表示される + UIタブ確認', async ({ browser }) => {
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const alice = await reg(aCtx, 'trend-a');
    const bob = await reg(bCtx, 'trend-b');

    // alice がコミュニティ作成
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: 'trend-club-' + Date.now(), description: 'トレンドテスト', visibility: 'private' },
    });
    expect(cr.ok()).toBeTruthy();
    const com = await cr.json();
    const communityId = com.id;

    // bob を招待
    const inv = await alice.page.request.post(`/api/communities/${communityId}/invites`, {
      data: { email: bob.email },
    });
    const invJ = await inv.json();
    await bob.page.goto(`/invite/${invJ.token}`);
    await bob.page.waitForURL(new RegExp(`/communities/${communityId}$`), { timeout: 10_000 });

    // ---------- 投稿を3つ作る ----------
    const post1 = await (await alice.page.request.post('/api/posts', {
      data: { body: 'トレンド1位になるはず — たくさんいいねされる投稿', communityId },
    })).json();
    const post2 = await (await alice.page.request.post('/api/posts', {
      data: { body: 'トレンド2位 — いいね1つ', communityId },
    })).json();
    const post3 = await (await alice.page.request.post('/api/posts', {
      data: { body: 'いいねゼロ — トレンドに出ない', communityId },
    })).json();

    // ---------- いいねを付ける ----------
    // post1: alice + bob = 2いいね
    await alice.page.request.post(`/api/posts/${post1.id}/like`, { data: {} });
    await bob.page.request.post(`/api/posts/${post1.id}/like`, { data: {} });
    // post2: bob = 1いいね
    await bob.page.request.post(`/api/posts/${post2.id}/like`, { data: {} });
    // post3: いいねなし

    // ---------- API テスト ----------
    const tr = await alice.page.request.get(`/api/posts/trending/${communityId}`);
    expect(tr.ok()).toBeTruthy();
    const trJson = await tr.json();
    console.log('trending items:', trJson.items.length);
    expect(trJson.items.length).toBe(2); // いいね0のpost3は含まれない
    expect(trJson.items[0].id).toBe(post1.id); // 2いいねが1位
    expect(trJson.items[1].id).toBe(post2.id); // 1いいねが2位
    expect(trJson.items[0].likeCount).toBe(2);
    expect(trJson.items[1].likeCount).toBe(1);

    // ---------- 非メンバーはアクセス不可 ----------
    const cCtx = await browser.newContext();
    const carol = await reg(cCtx, 'trend-c');
    const forbidden = await carol.page.request.get(`/api/posts/trending/${communityId}`);
    expect(forbidden.status()).toBe(403);
    await cCtx.close();

    // ---------- UI テスト: トレンドタブ ----------
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});

    // トレンドタブをクリック
    const trendTab = alice.page.getByRole('button', { name: /トレンド/ });
    await expect(trendTab).toBeVisible();
    await trendTab.click();
    await alice.page.waitForTimeout(1000);
    await shot(alice.page, 'trending-tab');

    // トレンド1位の投稿が表示されている
    await expect(alice.page.locator('.post-card').first()).toContainText('トレンド1位になるはず');
    // 2件表示されている
    const cards = alice.page.locator('.post-card');
    await expect(cards).toHaveCount(2);

    // いいねゼロの投稿は表示されない
    await expect(alice.page.locator('body')).not.toContainText('いいねゼロ');

    await shot(alice.page, 'trending-verified');
    console.log('SHOTS:', fs.readdirSync(SHOTS_DIR).sort().join('\n'));
    await aCtx.close();
    await bCtx.close();
  });
});
