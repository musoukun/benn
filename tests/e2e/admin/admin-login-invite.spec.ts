import { test, expect } from '@playwright/test';

// 管理者ログイン・招待・ダークモードエラー表示・未ログイン時ヘッダーのE2Eテスト
// 注意: このテストは Admin テーブルが空の状態で始める前提。
// 既に管理者がいる場合は初回作成テストはスキップされる。

const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ADMIN_EMAIL = `admin-${stamp}@example.test`;
const ADMIN_PW = 'adminpwpw-' + stamp;
const ADMIN_NAME = `管理者-${stamp}`;

test.describe('管理者テーブル分離', () => {
  test('初回管理者作成 → ダッシュボード表示', async ({ page }) => {
    await page.goto('/admin-setting');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 管理者が既に存在する場合はログインリンクが出る → 新規作成フローをスキップ
    const initForm = page.locator('text=管理者アカウントを作成');
    const loginLink = page.locator('text=管理者としてログインしてください');

    if (await loginLink.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // 初回作成フォーム
    await expect(initForm).toBeVisible();
    await page.locator('input[type="text"]').fill(ADMIN_NAME);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PW);
    await page.getByRole('button', { name: /管理者を作成/ }).click();
    await page.waitForLoadState('networkidle').catch(() => {});

    // ダッシュボードが表示される
    await expect(page.locator('text=管理者ページ')).toBeVisible();
    await expect(page.locator('text=ユーザ管理')).toBeVisible();
    await expect(page.locator('text=管理者')).toBeVisible();
    await expect(page.locator('text=所属マスタ')).toBeVisible();

    // プライベートコミュニティタブが消えていること
    await expect(page.locator('button:has-text("プライベートコミュニティ")')).not.toBeVisible();

    await page.screenshot({ path: './screenshots/admin-dashboard.png' });
  });

  test('管理者ログインページ', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.locator('h2:has-text("管理者ログイン")')).toBeVisible();

    // 間違ったパスワードでエラー表示
    await page.locator('input[type="email"]').fill('wrong@example.test');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /管理者ログイン/ }).click();
    await expect(page.locator('.msg-block.alert')).toBeVisible();
    await expect(page.locator('.msg-block.alert')).toContainText('メールまたはパスワードが違います');

    await page.screenshot({ path: './screenshots/admin-login-error.png' });
  });

  test('管理者ログインページ ダークモード エラー表示', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle').catch(() => {});

    // ダークモードに切り替え
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // エラーを出す
    await page.locator('input[type="email"]').fill('wrong@example.test');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /管理者ログイン/ }).click();
    await expect(page.locator('.msg-block.alert')).toBeVisible();

    // ダークモードでエラーメッセージが読めること (テキストが暗い背景に対して見える)
    const alert = page.locator('.msg-block.alert');
    const color = await alert.evaluate((el) => getComputedStyle(el).color);
    const bg = await alert.evaluate((el) => getComputedStyle(el).backgroundColor);
    // テキスト色が暗くないこと (RGB の平均が 128 以上 = 明るい文字)
    const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
    expect(avg).toBeGreaterThan(128);

    await page.screenshot({ path: './screenshots/admin-login-darkmode-error.png' });
  });

  test('通常ログインページ ダークモード エラー表示', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle').catch(() => {});

    // ダークモードに切り替え
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await page.locator('input[type="email"]').fill('wrong@example.test');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /ログイン/ }).click();
    await expect(page.locator('.msg-block.alert')).toBeVisible();

    const alert = page.locator('.msg-block.alert');
    const color = await alert.evaluate((el) => getComputedStyle(el).color);
    const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
    expect(avg).toBeGreaterThan(128);

    await page.screenshot({ path: './screenshots/login-darkmode-error.png' });
  });

  test('管理者ページではヘッダーにログイン/新規登録が出ない', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle').catch(() => {});

    // ヘッダーにログイン/新規登録ボタンが無いこと
    await expect(page.locator('header a:has-text("ログイン")')).not.toBeVisible();
    await expect(page.locator('header a:has-text("新規登録")')).not.toBeVisible();

    await page.screenshot({ path: './screenshots/admin-page-no-login-buttons.png' });
  });

  test('未ログイン時 ヘッダーに Communities が出ない', async ({ page }) => {
    await page.goto('/trending');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Communities リンクが無いこと
    await expect(page.locator('header a:has-text("Communities")')).not.toBeVisible();
    // Trending リンクはあること
    await expect(page.locator('header a:has-text("Trending")')).toBeVisible();

    await page.screenshot({ path: './screenshots/public-trending-no-communities.png' });
  });
});
