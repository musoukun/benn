import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('エディタのスクロール同期トグルが動く', async ({ page }) => {
  await registerAndLogin(page, 'sync');
  await page.goto('/editor');

  const toggle = page.getByRole('button', { name: /同期/ });
  await expect(toggle).toBeVisible();
  // デフォルトは ON
  await expect(toggle).toContainText(/同期ON/);

  await toggle.click();
  await expect(toggle).toContainText(/同期OFF/);

  // localStorage に永続化されること
  const stored = await page.evaluate(() => localStorage.getItem('uchi:scrollSync'));
  expect(stored).toBe('0');

  await toggle.click();
  await expect(toggle).toContainText(/同期ON/);
});
