import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOTS_DIR = path.join(process.cwd(), 'screenshots-header');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
let _i = 0;
function p(n: string) { _i++; return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${n}.png`); }
async function shot(page: Page, name: string) { await page.waitForTimeout(300); await page.screenshot({ path: p(name), fullPage: false }); }

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

test('account dropdown menu shows name + email + 設定 + ログアウト', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const alice = await reg(ctx, 'hdr');
  await alice.page.goto('/');
  await alice.page.waitForLoadState('networkidle').catch(() => {});
  await shot(alice.page, 'header-closed');

  // 「設定」「ログアウト」 が直接 header から消えていること
  // (アバターメニューの中にだけある)
  const headerInner = alice.page.locator('.header-inner');
  await expect(headerInner.getByText('⚙設定')).toHaveCount(0);
  await expect(headerInner.getByRole('button', { name: 'ログアウト' })).toHaveCount(0);

  // アバターを押すとメニューが開く
  await alice.page.locator('.account-menu-trigger').click();
  await alice.page.waitForTimeout(300);
  await shot(alice.page, 'header-open');

  const panel = alice.page.locator('.account-menu-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.account-menu-name')).toContainText(alice.name);
  await expect(panel.locator('.account-menu-email')).toContainText(alice.email);
  await expect(panel).toContainText('設定');
  await expect(panel).toContainText('ログアウト');
  await expect(panel).toContainText('プロフィール');

  // 名前の行をクリック → /users/{id}
  await panel.locator('.account-menu-header').click();
  await alice.page.waitForURL(/\/users\//, { timeout: 5000 });
  await shot(alice.page, 'profile-page');

  // メニューを開いてログアウト
  await alice.page.goto('/');
  await alice.page.locator('.account-menu-trigger').click();
  await alice.page.waitForTimeout(200);
  await alice.page.getByRole('button', { name: /ログアウト/ }).click();
  await alice.page.waitForURL(/\/login/, { timeout: 5000 });
  await shot(alice.page, 'after-logout');

  await ctx.close();
});
