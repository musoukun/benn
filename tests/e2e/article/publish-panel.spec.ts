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

test('新規エディタ: 「公開する」で右パネルが開き、emoji/category/topics/scheduledが揃う', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'pp');
  await page.goto('/editor');
  await page.waitForLoadState('networkidle').catch(() => {});

  // ツールバーから「画像を添付」が表示 (旧「画像」ではない)
  await expect(page.getByRole('button', { name: /画像を添付/ })).toBeVisible();
  // 旧 emoji input / Tech-Idea ボタンはツールバーにない
  await expect(page.locator('.editor-toolbar input[type="text"]')).toHaveCount(0);
  await expect(page.locator('.editor-toolbar').getByRole('button', { name: /^Tech$/ })).toHaveCount(0);

  // タイトルと本文を入れる
  await page.locator('.title-input').fill('panel test');
  await page.locator('.editor-pane textarea').fill('# hello');

  // 「公開する」をクリック → パネルが開く
  await page.getByRole('button', { name: /^公開する$/ }).click();
  const panel = page.locator('.publish-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('h3')).toContainText('公開設定');

  // 絵文字パレット (新規時に出る)
  await expect(panel.locator('.publish-panel-emoji-palette')).toBeVisible();
  await panel.locator('.publish-panel-emoji-cell').filter({ hasText: '🚀' }).click();
  await expect(panel.locator('.publish-panel-emoji-input')).toHaveValue('🚀');

  // カテゴリーカード (新規時に出る)
  await expect(panel.getByRole('button', { name: /^Tech/ })).toBeVisible();
  await panel.getByRole('button', { name: /^Idea/ }).click();
  await expect(panel.locator('.publish-panel-cat-card.active')).toContainText('Idea');

  // トピック未設定なので 公開ボタンは disabled + ヒント表示
  await expect(panel.locator('.publish-panel-hint')).toContainText('トピックを設定してください');
  await expect(panel.locator('.publish-panel-submit')).toBeDisabled();

  // トピックを入れる (TagInput の input)
  const tagInput = panel.getByPlaceholder(/トピックを入力/);
  await tagInput.fill('react');
  await tagInput.press('Enter');

  // 公開ボタンが有効化
  await expect(panel.locator('.publish-panel-submit')).toBeEnabled();

  // 公開する → /articles/:id に遷移
  await panel.locator('.publish-panel-submit').click();
  await page.waitForURL(/\/articles\//, { timeout: 10_000 });
  await ctx.close();
});

test('編集モード: 絵文字パレットとカテゴリーカードが非表示', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'pp2');
  // 既存記事を作成
  const art = await page.request
    .post('/api/articles', {
      data: {
        title: 'edit test',
        emoji: '🐱',
        type: 'howto',
        topicNames: ['rust'],
        body: '# hi',
        published: true,
      },
    })
    .then((r) => r.json());
  await page.goto(`/editor/${art.id}`);
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.getByRole('button', { name: /^公開する$/ }).click();
  const panel = page.locator('.publish-panel');
  await expect(panel).toBeVisible();
  // 編集時: 絵文字パレットとカテゴリーは非表示
  await expect(panel.locator('.publish-panel-emoji-palette')).toHaveCount(0);
  await expect(panel.locator('.publish-panel-category')).toHaveCount(0);
  // トピックと公開予約は出る
  await expect(panel.locator('input[type="datetime-local"]')).toBeVisible();
  await ctx.close();
});
