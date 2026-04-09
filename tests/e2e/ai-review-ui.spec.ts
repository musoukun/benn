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

// AI 呼び出しなしの UI 構造テスト
test('Editor: AI添削ボタンから右からサイドバーが出る (水色テーマ)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'air');
  const art = await page.request
    .post('/api/articles', {
      data: {
        title: 'air test',
        emoji: '🧪',
        type: 'tech',
        topicNames: ['ai'],
        body: '# title\n\n本文',
        published: false,
      },
    })
    .then((r) => r.json());
  await page.goto(`/editor/${art.id}`);
  await page.waitForLoadState('networkidle').catch(() => {});

  // 旧「同期ON/OFF」ボタンはツールバーから消えている
  await expect(page.getByRole('button', { name: /同期ON|同期OFF/ })).toHaveCount(0);

  // 「AI添削」ボタンが置かれていて bot svg を含む
  const aiBtn = page.getByRole('button', { name: /AI添削/ });
  await expect(aiBtn).toBeVisible();
  await expect(aiBtn.locator('svg.lucide-bot')).toBeVisible();

  // プレビュー右上に同期トグル
  const syncToggle = page.locator('.preview-sync-toggle');
  await expect(syncToggle).toBeVisible();

  // 旧 left-side toggle (.ai-review-toggle) は完全に削除されている
  await expect(page.locator('.ai-review-toggle')).toHaveCount(0);
  // デフォルトではサイドバーは閉じている
  await expect(page.locator('.ai-review-content')).toHaveCount(0);

  // AI添削ボタンクリックでサイドバーが開く
  await aiBtn.click();
  const content = page.locator('.ai-review-content');
  await expect(content).toBeVisible();
  await page.waitForTimeout(280); // slide-in animation

  // タイトルから 🤖 が消えている
  const head = page.locator('.ai-review-head h3');
  await expect(head).toHaveText('レビュー');

  // 右側からスライドイン: 右端が viewport 右端
  const vpw = page.viewportSize()!.width;
  const contentBox = await content.boundingBox();
  expect(contentBox).toBeTruthy();
  expect(contentBox!.x + contentBox!.width).toBeGreaterThanOrEqual(vpw - 2);

  // 紺色 (#0b1e35 = rgb(11,30,53)) ではない
  const bg = await content.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  expect(bg).not.toMatch(/rgb\(11,\s*30,\s*53\)/);
  // 文字色は読みやすいダーク (slate)
  const fg = await head.evaluate((el) => getComputedStyle(el as HTMLElement).color);
  expect(fg).toMatch(/rgb\(15,\s*23,\s*42\)/); // #0f172a

  // run button + bot svg
  await expect(page.locator('.ai-review-run-btn')).toContainText('AIレビューを実行');
  await expect(page.locator('.ai-review-run-btn svg.lucide-bot')).toBeVisible();

  // 閉じるボタン »
  await page.locator('.ai-review-close').click();
  await expect(content).toHaveCount(0);

  await ctx.close();
});
