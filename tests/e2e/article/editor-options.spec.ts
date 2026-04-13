import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('エディタの公開オプション (公開範囲 + コミュニティ) が表示される', async ({ page }) => {
  await registerAndLogin(page, 'opts');
  await page.goto('/editor');

  // 折り畳みを開く
  await page.locator('summary', { hasText: '公開オプション' }).click();

  // 公開範囲セレクト
  const visSelect = page.locator('select').first();
  await visSelect.selectOption('affiliation_in');
  await expect(visSelect).toHaveValue('affiliation_in');
});

test('PublishPanel: 公開予約の datetime-local が右パネル内に存在', async ({ page }) => {
  await registerAndLogin(page, 'opts2');
  await page.goto('/editor');
  // 「公開する」をクリックしてパネルを開く
  await page.getByRole('button', { name: /^公開する$/ }).click();
  await expect(page.locator('.publish-panel')).toBeVisible();
  // 公開予約の datetime-local が出る
  await expect(page.locator('.publish-panel input[type="datetime-local"]')).toBeVisible();
});
