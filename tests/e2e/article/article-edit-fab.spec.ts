import { test, expect } from '@playwright/test';
import { createArticleViaApi, registerAndLogin } from './helpers';

test('自分の記事に編集ボタン(浮動FAB)が出る、他人の記事には出ない', async ({ page, browser }) => {
  // ユーザーA: 記事を作る
  await registerAndLogin(page, 'fab-a');
  const a = await createArticleViaApi(page, { title: 'fab-test', body: 'hello' });
  await page.goto(`/articles/${a.id}`);
  await expect(page.locator('.article-edit-fab')).toBeVisible();
  await expect(page.locator('.article-edit-fab')).toHaveText(/編集/);

  // ユーザーB (別ブラウザコンテキスト): 同じ記事を見ても編集ボタンは出ない
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await registerAndLogin(page2, 'fab-b');
  await page2.goto(`/articles/${a.id}`);
  await expect(page2.locator('.article-edit-fab')).toHaveCount(0);
  await ctx2.close();
});
