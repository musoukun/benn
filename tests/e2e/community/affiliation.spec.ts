import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('所属タグを作成して自分にひもづけられる', async ({ page }) => {
  await registerAndLogin(page, 'aff');
  await page.goto('/me/settings');
  await page.getByRole('button', { name: '所属' }).click();

  const name = 'team-' + Date.now();
  await page.getByPlaceholder('新しい所属名').fill(name);
  await page.getByRole('button', { name: '追加' }).click();

  // 追加した所属が自分に紐づいた状態 (アクティブ表示) で見える
  await expect(page.getByRole('button', { name })).toBeVisible();
});
