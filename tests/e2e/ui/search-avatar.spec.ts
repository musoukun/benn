import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 5 E2E:
// - 検索3タブ (記事 / コミュニティ / SNS 投稿)
// - アバターを絵文字で設定 (最も簡単なパス)

const SHOTS_DIR = path.join(process.cwd(), 'screenshots', 'search-avatar');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
let _i = 0;
function shotPath(name: string) {
  _i++;
  return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${name}.png`);
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: false });
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

test.describe('Phase5 検索 + アバター', () => {
  test.setTimeout(180_000);

  test('検索3タブが切り替わって結果が出る', async ({ browser }) => {
    const ctx = await browser.newContext();
    const alice = await reg(ctx, 'srch-a');

    // テストデータ: 記事 + community + post
    const uniq = 'unique' + Date.now().toString(36);
    await alice.page.request.post('/api/articles', {
      data: {
        title: `Phase5 検索テスト ${uniq}`,
        emoji: '🔍',
        type: 'howto',
        body: `この記事は ${uniq} を含みます`,
        topicNames: ['phase5'],
        published: true,
        visibility: 'public',
      },
    });
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: `srch-club ${uniq}`, description: '', visibility: 'public' },
    });
    const com = await cr.json();
    await alice.page.request.post('/api/posts', {
      data: { body: `この投稿も ${uniq} を含みます`, communityId: com.id },
    });

    // /search に直接行って検索
    await alice.page.goto(`/search?q=${uniq}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await alice.page.waitForTimeout(800);
    await shot(alice.page, 'search-articles');
    // 記事タブの結果
    await expect(alice.page.locator('.search-results')).toContainText(`Phase5 検索テスト ${uniq}`);

    // コミュニティタブ
    await alice.page.getByRole('button', { name: /🌐 コミュニティ/ }).click();
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'search-communities');
    await expect(alice.page.locator('.search-results')).toContainText(`srch-club ${uniq}`);

    // SNS 投稿タブ
    await alice.page.getByRole('button', { name: /💬 SNS 投稿/ }).click();
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'search-posts');
    await expect(alice.page.locator('.search-results')).toContainText(uniq);

    // ヘッダーの検索バー (キーワード入力 → Enter で /search に飛ぶ)
    await alice.page.goto('/');
    const search = alice.page.locator('input.search').first();
    await search.fill(uniq);
    await search.press('Enter');
    await alice.page.waitForURL(/\/search/, { timeout: 5000 });
    await shot(alice.page, 'search-via-header');

    await ctx.close();
  });

  test('絵文字でアバター設定', async ({ browser }) => {
    const ctx = await browser.newContext();
    const alice = await reg(ctx, 'av-a');
    await alice.page.goto('/me/settings');
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    // プロフィールタブが初期のはず
    await shot(alice.page, 'settings-profile');

    // 絵文字を入力して「設定」
    await alice.page.locator('input[placeholder="🐱"]').fill('🐱');
    await alice.page.getByRole('button', { name: '設定' }).click();
    await alice.page.waitForTimeout(2000);
    await shot(alice.page, 'avatar-set');
    await expect(alice.page.locator('body')).toContainText('絵文字アバターを設定しました');

    // /api/me で avatarUrl が入っている
    const me = await alice.page.request.get('/api/me');
    const meJ = await me.json();
    expect(meJ.avatarUrl).toBeTruthy();
    expect(meJ.avatarUrl).toMatch(/uploads|files|\.png/);

    await ctx.close();
  });
});
