import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';

const SHOT_DIR = path.resolve('screenshots/tl-visibility-test');

// ユーザー登録ヘルパー
async function register(
  ctx: BrowserContext,
  prefix: string
): Promise<{ page: Page; userId: string; name: string }> {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });
  const me = await page.request.get('/api/me');
  const j = await me.json();
  return { page, userId: j.id, name };
}

test.describe('タイムライン権限スクショテスト', () => {
  test.setTimeout(300_000);

  test('open / private 権限の全ケースをスクショ付きで検証', async ({ browser }) => {
    // ===== 0. ユーザー3人作成 =====
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();

    const alice = await register(aliceCtx, 'Alice-owner');
    const bob = await register(bobCtx, 'Bob-member');
    const carol = await register(carolCtx, 'Carol-outsider');

    console.log('Alice:', alice.userId, alice.name);
    console.log('Bob:', bob.userId, bob.name);
    console.log('Carol:', carol.userId, carol.name);

    // ===== 1. Alice がコミュニティ作成 =====
    const cname = '権限テスト-' + Date.now();
    const createRes = await alice.page.request.post('/api/communities', {
      data: { name: cname, description: 'TL権限テスト', visibility: 'public' },
    });
    expect(createRes.ok()).toBeTruthy();
    const community = await createRes.json();
    const cid = community.id;

    // Bob をメンバーに追加
    await alice.page.request.post(`/api/communities/${cid}/members`, {
      data: { userId: bob.userId },
    });

    // ===== 2. TL を作成 =====
    // open TL
    const openRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: { name: 'オープンTL', visibility: 'open' },
    });
    const openTl = await openRes.json();

    // private TL (Bob だけメンバー)
    const privRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: { name: 'プライベートTL', visibility: 'private', memberIds: [bob.userId] },
    });
    const privTl = await privRes.json();

    // ===== 3. 各TLに投稿 =====
    await alice.page.request.post('/api/posts', {
      data: { title: 'オープンTLの本格投稿', body: '# オープンTL\nメンバー全員が見える投稿です。', communityId: cid, timelineId: openTl.id },
    });
    await alice.page.request.post('/api/posts', {
      data: { body: 'オープンTLのつぶやき', communityId: cid, timelineId: openTl.id },
    });
    await alice.page.request.post('/api/posts', {
      data: { title: 'プライベートTLの秘密投稿', body: '# 秘密\nBobとAliceだけが見える投稿です。', communityId: cid, timelineId: privTl.id },
    });
    await alice.page.request.post('/api/posts', {
      data: { body: 'プライベートTLのつぶやき 🔒', communityId: cid, timelineId: privTl.id },
    });

    // ===== 4. スクショ: Alice (owner) =====
    await alice.page.goto(`/communities/${cid}`);
    await alice.page.waitForTimeout(1500);
    await alice.page.screenshot({ path: path.join(SHOT_DIR, '01-alice-home-tl.png'), fullPage: true });

    // Alice: オープンTL
    const aliceOpenBtn = alice.page.locator('button', { hasText: 'オープンTL' });
    if (await aliceOpenBtn.count() > 0) {
      await aliceOpenBtn.click();
      await alice.page.waitForTimeout(1000);
    }
    await alice.page.screenshot({ path: path.join(SHOT_DIR, '02-alice-open-tl.png'), fullPage: true });

    // Alice: プライベートTL (owner なので見える)
    const alicePrivBtn = alice.page.locator('button', { hasText: 'プライベートTL' });
    if (await alicePrivBtn.count() > 0) {
      await alicePrivBtn.click();
      await alice.page.waitForTimeout(1000);
    }
    await alice.page.screenshot({ path: path.join(SHOT_DIR, '03-alice-private-tl.png'), fullPage: true });

    // ===== 5. スクショ: Bob (メンバー) =====
    await bob.page.goto(`/communities/${cid}`);
    await bob.page.waitForTimeout(1500);
    await bob.page.screenshot({ path: path.join(SHOT_DIR, '04-bob-home-tl.png'), fullPage: true });

    // Bob: オープンTL (メンバーなので見える)
    const bobOpenBtn = bob.page.locator('button', { hasText: 'オープンTL' });
    if (await bobOpenBtn.count() > 0) {
      await bobOpenBtn.click();
      await bob.page.waitForTimeout(1000);
    }
    await bob.page.screenshot({ path: path.join(SHOT_DIR, '05-bob-open-tl.png'), fullPage: true });

    // Bob: プライベートTL (TLメンバーなので見える)
    const bobPrivBtn = bob.page.locator('button', { hasText: 'プライベートTL' });
    if (await bobPrivBtn.count() > 0) {
      await bobPrivBtn.click();
      await bob.page.waitForTimeout(1000);
    }
    await bob.page.screenshot({ path: path.join(SHOT_DIR, '06-bob-private-tl.png'), fullPage: true });

    // ===== 6. スクショ: Carol (部外者・非メンバー) =====
    await carol.page.goto(`/communities/${cid}`);
    await carol.page.waitForTimeout(1500);
    await carol.page.screenshot({ path: path.join(SHOT_DIR, '07-carol-not-member.png'), fullPage: true });

    // Carol: API直アクセスで open TL → 403
    const carolOpenApi = await carol.page.request.get(`/api/posts/timeline/${openTl.id}`);
    console.log('Carol open TL API status:', carolOpenApi.status());
    expect(carolOpenApi.status()).toBe(403);

    // Carol: API直アクセスで private TL → 403
    const carolPrivApi = await carol.page.request.get(`/api/posts/timeline/${privTl.id}`);
    console.log('Carol private TL API status:', carolPrivApi.status());
    expect(carolPrivApi.status()).toBe(403);

    // ===== 7. Carol がコミュニティに参加 =====
    await carol.page.request.post(`/api/communities/${cid}/join`, { data: {} });
    await carol.page.goto(`/communities/${cid}`);
    await carol.page.waitForTimeout(1500);
    await carol.page.screenshot({ path: path.join(SHOT_DIR, '08-carol-after-join.png'), fullPage: true });

    // Carol: オープンTL (参加したので見える)
    const carolOpenBtn = carol.page.locator('button', { hasText: 'オープンTL' });
    if (await carolOpenBtn.count() > 0) {
      await carolOpenBtn.click();
      await carol.page.waitForTimeout(1000);
    }
    await carol.page.screenshot({ path: path.join(SHOT_DIR, '09-carol-open-tl-after-join.png'), fullPage: true });

    // Carol: プライベートTL はリストに表示されないことを確認
    const carolPrivBtnAfter = carol.page.locator('button', { hasText: 'プライベートTL' });
    const privBtnCount = await carolPrivBtnAfter.count();
    console.log('Carol sees private TL button:', privBtnCount > 0 ? 'YES (BUG!)' : 'NO (correct)');
    expect(privBtnCount, 'Carol should NOT see private TL button').toBe(0);
    await carol.page.screenshot({ path: path.join(SHOT_DIR, '10-carol-no-private-tl-visible.png'), fullPage: true });

    // ===== 8. Alice が Bob を private TL から外す =====
    await alice.page.request.patch(`/api/communities/${cid}/timelines/${privTl.id}`, {
      data: { memberIds: [] },
    });

    // Bob: プライベートTL が見えなくなる
    await bob.page.goto(`/communities/${cid}`);
    await bob.page.waitForTimeout(1500);
    const bobPrivBtnAfter = bob.page.locator('button', { hasText: 'プライベートTL' });
    const bobPrivCount = await bobPrivBtnAfter.count();
    console.log('Bob sees private TL after removal:', bobPrivCount > 0 ? 'YES (BUG!)' : 'NO (correct)');
    expect(bobPrivCount, 'Bob should NOT see private TL after removal').toBe(0);
    await bob.page.screenshot({ path: path.join(SHOT_DIR, '11-bob-after-removal-from-private.png'), fullPage: true });

    // Alice は依然としてプライベートTL が見える (owner)
    await alice.page.goto(`/communities/${cid}`);
    await alice.page.waitForTimeout(1500);
    const alicePrivBtnAfter = alice.page.locator('button', { hasText: 'プライベートTL' });
    expect(await alicePrivBtnAfter.count(), 'Alice (owner) still sees private TL').toBeGreaterThan(0);
    await alicePrivBtnAfter.click();
    await alice.page.waitForTimeout(1000);
    await alice.page.screenshot({ path: path.join(SHOT_DIR, '12-alice-still-sees-private.png'), fullPage: true });

    // ===== 9. private → open に変更 =====
    await alice.page.request.patch(`/api/communities/${cid}/timelines/${privTl.id}`, {
      data: { visibility: 'open' },
    });
    await bob.page.goto(`/communities/${cid}`);
    await bob.page.waitForTimeout(1500);
    const bobPrivBtnOpen = bob.page.locator('button', { hasText: 'プライベートTL' });
    expect(await bobPrivBtnOpen.count(), 'Bob sees TL after it became open').toBeGreaterThan(0);
    await bobPrivBtnOpen.click();
    await bob.page.waitForTimeout(1000);
    await bob.page.screenshot({ path: path.join(SHOT_DIR, '13-bob-sees-after-open.png'), fullPage: true });

    // cleanup
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
    console.log('✅ 全スクショテスト完了 → doc/tl-visibility-test/');
  });
});
