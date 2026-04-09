import { test, expect } from '@playwright/test';
import { createArticleViaApi, registerAndLogin } from './helpers';

test('集約ページで記事を選んでエディタにプリフィルできる', async ({ page }) => {
  await registerAndLogin(page, 'agg');
  // uniq なタイトルプレフィックスで作成 (検索でヒットさせる)
  const tag = 'aggE2E' + Date.now().toString(36);
  const a1 = await createArticleViaApi(page, { title: tag + '-A', body: 'aaa' });
  const a2 = await createArticleViaApi(page, { title: tag + '-B', body: 'bbb' });
  expect(a1.id).toBeTruthy();
  expect(a2.id).toBeTruthy();

  await page.goto('/me/aggregate');
  // 検索タブで自分の記事を読み込む (header の "記事を検索…" と区別するため exact)
  await page.getByPlaceholder('検索', { exact: true }).fill(tag);
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByText(tag + '-A')).toBeVisible();
  await expect(page.getByText(tag + '-B')).toBeVisible();

  // 両方チェック (ヘッダーとは別にカード内のチェックボックスを全部選ぶ)
  const boxes = page.locator('.card input[type="checkbox"]');
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    const label = await boxes.nth(i).evaluate((el) => (el.parentElement?.textContent || ''));
    if (label.includes(tag)) await boxes.nth(i).check();
  }

  // 「まとめ記事を作る」 (旧名: 集約してエディタで開く) でエディタへ
  await page.getByRole('button', { name: /まとめ記事を作る/ }).click();
  await page.waitForURL(/\/editor/);

  // エディタの本文に両タイトルが入っている (順不同)
  const ta = page.locator('.editor-pane textarea');
  const value = await ta.inputValue();
  expect(value).toContain(tag + '-A');
  expect(value).toContain(tag + '-B');
});
