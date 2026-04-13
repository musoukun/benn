import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('アカウント設定: AIプロバイダ・プロンプトタブが開ける', async ({ page }) => {
  await registerAndLogin(page, 'set');
  await page.goto('/me/settings');

  await page.getByRole('button', { name: 'AIプロバイダ' }).click();
  await expect(page.getByRole('heading', { name: 'AIプロバイダ' })).toBeVisible();

  await page.getByRole('button', { name: 'プロンプト' }).click();
  await expect(page.getByRole('heading', { name: /レビュー用プロンプト/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /要約用プロンプト/ })).toBeVisible();
});
