import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('コミュニティを作成 → 詳細ページのオーナータブが表示される', async ({ page }) => {
  await registerAndLogin(page, 'comm');
  await page.goto('/communities');

  const name = 'community-' + Date.now();
  await page.getByPlaceholder('コミュニティ名').fill(name);
  await page.getByPlaceholder('説明 (任意)').fill('e2e test community');
  await page.getByRole('button', { name: '作成' }).click();

  // 一覧に出る (新規作成すると reload される)
  await expect(page.getByText(name).first()).toBeVisible();

  // 詳細を開く
  await page.getByText(name).first().click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();

  // owner なので「承認待ち」「招待」「設定」タブが見える
  await expect(page.getByRole('button', { name: '承認待ち' })).toBeVisible();
  await expect(page.getByRole('button', { name: '招待' })).toBeVisible();
  await expect(page.getByRole('button', { name: '設定' })).toBeVisible();

  // タイムラインタブにデフォルトで「ホーム」がある (旧: general)
  await expect(page.getByRole('button', { name: /# ホーム/ })).toBeVisible();
});

test('コミュニティ設定タブで新しいタイムラインを追加できる', async ({ page }) => {
  await registerAndLogin(page, 'comm-tl');
  await page.goto('/communities');
  const name = 'tlc-' + Date.now();
  await page.getByPlaceholder('コミュニティ名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await page.getByText(name).first().click();
  await page.getByRole('button', { name: '設定' }).click();

  await page.getByPlaceholder('新タイムライン名').fill('progress');
  // 「公開範囲 select」と「タイムライン visibility select」が両方あるので
  // 後者 (新タイムライン名 input の隣にある方) を選ぶ
  await page.locator('input[placeholder="新タイムライン名"] ~ select').selectOption('public');
  await page.getByRole('button', { name: '追加' }).click();

  await expect(page.getByText(/# progress/)).toBeVisible();
});
