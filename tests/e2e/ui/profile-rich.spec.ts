import { test, expect, type Page } from '@playwright/test';

async function reg(page: Page, prefix: string) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(`${prefix}-${stamp}`);
  await page.locator('input[type="email"]').fill(`${prefix}-${stamp}@example.test`);
  await page.locator('input[type="password"]').fill('pwpwpwpw-' + stamp);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
}

test('rich profile page: hero + stats + tabs', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'prof');
  // 自分の id を取得
  const me = await page.request.get('/api/me').then((r) => r.json());
  await page.goto(`/users/${me.id}`);
  await page.waitForLoadState('networkidle').catch(() => {});

  // hero と stats が描画されている
  await expect(page.locator('.profile-hero')).toBeVisible();
  await expect(page.locator('.profile-name')).toContainText(me.name);
  await expect(page.locator('.profile-stats')).toBeVisible();
  // 4つの stat (記事 / SNS投稿 / フォロワー / フォロー中)
  const statLabels = await page.locator('.profile-stat-label').allTextContents();
  expect(statLabels).toEqual(['記事', 'SNS投稿', 'フォロワー', 'フォロー中']);

  // タブ切替
  await expect(page.locator('.profile-tab').first()).toContainText('記事');
  await page.locator('.profile-tab').nth(1).click();
  await expect(page.getByText('まだSNS投稿がありません')).toBeVisible();

  // 「プロフィール編集」ボタン (自分のページ)
  await expect(page.getByRole('button', { name: /プロフィール編集/ })).toBeVisible();
  await ctx.close();
});
