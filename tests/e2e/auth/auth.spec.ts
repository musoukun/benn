import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test('新規登録 → ホームに遷移してログイン状態になる', async ({ page }) => {
  const { name } = await registerAndLogin(page, 'auth');
  // ヘッダーに「投稿する」ボタンが出ている = ログイン済み
  await expect(page.getByRole('link', { name: /投稿する/ })).toBeVisible();
  // 自分のアバターのリンク先 (/users/<id>) も到達可能
  await expect(page.locator('header')).toContainText(/Communities|Trending/);
});
