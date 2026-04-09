import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('エディタの公開オプション (公開範囲 + 予約 + コミュニティ) が表示される', async ({ page }) => {
  await registerAndLogin(page, 'opts');
  await page.goto('/editor');

  // 折り畳みを開く
  await page.locator('summary', { hasText: '公開オプション' }).click();

  // 公開範囲セレクト
  const visSelect = page.locator('select').first();
  await visSelect.selectOption('affiliation_in');
  await expect(visSelect).toHaveValue('affiliation_in');

  // datetime-local が存在
  await expect(page.locator('input[type="datetime-local"]')).toBeVisible();
});
