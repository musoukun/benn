import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('エディタのスクロール同期トグルが動く (preview-sync-toggle)', async ({ page }) => {
  await registerAndLogin(page, 'sync');
  await page.goto('/editor');

  const toggle = page.locator('.preview-sync-toggle');
  await expect(toggle).toBeVisible();
  // デフォルトは ON (.on クラス)
  await expect(toggle).toHaveClass(/\bon\b/);

  await toggle.click();
  await expect(toggle).not.toHaveClass(/\bon\b/);

  // localStorage に永続化される
  const stored = await page.evaluate(() => localStorage.getItem('uchi:scrollSync'));
  expect(stored).toBe('0');

  await toggle.click();
  await expect(toggle).toHaveClass(/\bon\b/);
});
