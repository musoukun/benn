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

test('ProfileEditor: 名前/bio/絵文字アバターを一括保存できる', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'pe');
  const me = await page.request.get('/api/me').then((r) => r.json());
  await page.goto(`/users/${me.id}`);
  await page.waitForLoadState('networkidle').catch(() => {});

  // ペンマーク (.profile-avatar-edit) が見える
  await expect(page.locator('.profile-avatar-edit')).toBeVisible();
  // ペンマーク click → ProfileEditor が出る (1つのカード)
  await page.locator('.profile-avatar-edit').click();
  await expect(page.locator('.profile-editor')).toBeVisible();

  // 名前 / bio を変更
  await page.locator('.profile-editor-input').fill('テスト名');
  await page.locator('.profile-editor-textarea').fill('自己紹介です');

  // 絵文字アバターも確定 (controlled モード = まだ保存されない)
  await page.locator('input[placeholder="🐱"]').fill('🐱');
  await page.getByRole('button', { name: '設定' }).click();
  // メッセージ「絵文字を確定しました (保存ボタンで反映)」
  await expect(page.getByText(/確定しました/)).toBeVisible();

  // この時点ではまだ反映されていないはず: グローバル state の name は元のまま
  const beforeMe = await page.request.get('/api/me').then((r) => r.json());
  expect(beforeMe.name).not.toBe('テスト名');
  expect(beforeMe.avatarUrl).toBeFalsy();

  // 保存ボタン
  await page.getByRole('button', { name: /保存 \(画像も反映\)|^保存$/ }).click();
  await expect(page.getByText('プロフィールを更新しました')).toBeVisible();

  // 反映確認: 名前変更 + avatarUrl 設定
  const afterMe = await page.request.get('/api/me').then((r) => r.json());
  expect(afterMe.name).toBe('テスト名');
  expect(afterMe.bio).toBe('自己紹介です');
  expect(afterMe.avatarUrl).toBeTruthy();

  await ctx.close();
});

test('AccountSettingsPage: profile タブで ProfileEditor が出る', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'pe2');
  await page.goto('/me/settings');
  await page.waitForLoadState('networkidle').catch(() => {});
  // プロフィールタブ (デフォルト) → ProfileEditor が見える
  await expect(page.locator('.profile-editor')).toBeVisible();
  // 同じく1カード内に名前 input と画像 emoji input が共存
  await expect(page.locator('.profile-editor-input')).toBeVisible();
  await expect(page.locator('input[placeholder="🐱"]')).toBeVisible();
  await ctx.close();
});
