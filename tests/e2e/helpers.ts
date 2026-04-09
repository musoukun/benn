import type { Page } from '@playwright/test';

// uniq なテストユーザーを作成してログインする
export async function registerAndLogin(page: Page, prefix = 'e2e'): Promise<{
  email: string;
  password: string;
  name: string;
}> {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;

  await page.goto('/register');
  // フォームは label + input (placeholder無し)。順序は 表示名 → メール → パスワード
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });

  return { email, password, name };
}

export async function createArticleViaApi(
  page: Page,
  input: { title: string; body: string; topicNames?: string[]; published?: boolean }
) {
  const r = await page.request.post('/api/articles', {
    data: {
      title: input.title,
      emoji: '✅',
      type: 'tech',
      body: input.body,
      topicNames: input.topicNames || ['e2e'],
      published: input.published ?? true,
    },
  });
  if (!r.ok()) throw new Error('createArticleViaApi failed: ' + r.status() + ' ' + (await r.text()));
  return r.json();
}
