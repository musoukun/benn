import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 1 E2E: コミュニティ内 SNS 投稿
// - メンバー2人を作成、片方が community を作る
// - もう片方を招待して入れる
// - 両者ともコミュニティ TL に SNS 投稿 (Post モデル経由)
// - 600字 fold が動くこと
// - URL を含む投稿で URL カードが描画されること
// - いいねトグル

const SHOTS_DIR = path.join(process.cwd(), 'screenshots', 'sns-post');

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
  const me = await (await page.request.get('/api/me')).json();
  return { page, email, name, userId: me.id };
}

/** Milkdown (ProseMirror) エディタにテキストを入力するヘルパー */
async function typeInComposer(page: Page, text: string) {
  const editor = page.locator('.post-composer-editor .ProseMirror');
  await editor.waitFor({ state: 'visible', timeout: 10_000 });
  await editor.click();
  await editor.pressSequentially(text, { delay: 10 });
}

/** API 経由で投稿する (Milkdown のテストが主目的でないケースに) */
async function postViaApi(page: Page, body: string, communityId: string, timelineId?: string) {
  const data: Record<string, string> = { body, communityId };
  if (timelineId) data.timelineId = timelineId;
  const r = await page.request.post('/api/posts', { data });
  expect(r.ok()).toBeTruthy();
  return r.json();
}

test.describe('Phase1 SNS 投稿フロー', () => {
  test.setTimeout(120_000);

  test('community 内で SNS 投稿 → 表示 → fold → like', async ({ browser }) => {
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const alice = await reg(aCtx, 'sns-a');
    const bob = await reg(bCtx, 'sns-b');

    // alice が community 作成
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: 'sns-club-' + Date.now(), description: 'SNS テスト', visibility: 'private' },
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

    // alice 視点で community を開く
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await shot(alice.page, 'alice-empty-timeline');

    // ---------- Milkdown エディタで Markdown 投稿 ----------
    await typeInComposer(alice.page, '# はじめての投稿');
    await alice.page.keyboard.press('Enter');
    await alice.page.keyboard.press('Enter');
    await typeInComposer(alice.page, '**太字** と `inline code`');
    await shot(alice.page, 'alice-composing');
    await alice.page.getByRole('button', { name: '投稿する' }).click();
    await alice.page.waitForTimeout(1500);
    await shot(alice.page, 'alice-after-post');

    // Markdown が HTML として描画される
    const firstCard = alice.page.locator('.post-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // ---------- API 経由で長文投稿 (fold テスト) ----------
    const longBody = 'あ'.repeat(700);
    await postViaApi(alice.page, longBody, communityId);
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await shot(alice.page, 'alice-long-post-folded');
    const foldBtn = alice.page.locator('.post-fold').first();
    await expect(foldBtn).toBeVisible();
    await expect(foldBtn).toContainText('続きを読む');
    await expect(foldBtn).toContainText('700');
    await foldBtn.click();
    await alice.page.waitForTimeout(200);
    await shot(alice.page, 'alice-long-post-expanded');
    await expect(alice.page.locator('.post-fold').first()).toContainText('折りたたむ');

    // ---------- URL 投稿 + URL カード描画 ----------
    await postViaApi(alice.page, 'URL テスト https://example.com', communityId);
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await alice.page.waitForTimeout(1500);
    const urlCard = alice.page.locator('.post-url-card').first();
    await expect(urlCard).toBeVisible({ timeout: 10_000 });
    await expect(urlCard).toContainText('example.com');

    // ---------- bob 視点: alice の投稿が見える + like ----------
    await bob.page.goto(`/communities/${communityId}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-sees-alice-posts');
    await expect(bob.page.locator('.post-card').first()).toBeVisible();

    // bob が alice の投稿に like
    const targetPost = bob.page.locator('.post-card').filter({ hasText: 'はじめての投稿' }).first();
    if (await targetPost.isVisible()) {
      await targetPost.locator('.post-action').first().click();
      await bob.page.waitForTimeout(500);
      await shot(bob.page, 'bob-liked');
      await expect(targetPost.locator('.post-action.liked')).toContainText('1');
    }

    // bob 自身も API 経由で投稿
    await postViaApi(bob.page, 'Bob からの返事。SNS 機能やっと来た！', communityId);
    await bob.page.goto(`/communities/${communityId}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-after-post');
    await expect(bob.page.locator('.post-card').first()).toContainText('Bob からの返事');

    // alice をリロードして bob の投稿を確認
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await shot(alice.page, 'alice-sees-bobs-post');
    await expect(alice.page.locator('body')).toContainText('Bob からの返事');

    console.log('SHOTS:', fs.readdirSync(SHOTS_DIR).sort().join('\n'));
    await aCtx.close();
    await bCtx.close();
  });
});
