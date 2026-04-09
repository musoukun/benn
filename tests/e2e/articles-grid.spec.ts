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

test('Trending/Following/Bookmarks: 記事は 2-grid レイアウト', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await reg(page, 'grid');

  // 4本の記事を投稿してソース確保
  for (let i = 0; i < 4; i++) {
    await page.request.post('/api/articles', {
      data: {
        title: `gridtest ${i}`,
        emoji: '🧪',
        type: 'howto',
        topicNames: ['test'],
        body: '# hi',
        published: true,
      },
    });
  }

  for (const path of ['/trending', '/following', '/bookmarks', '/topics/test']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => {});
    // grid wrapper が存在するか, または empty/loading
    const grid = page.locator('.articles-grid');
    const gridCount = await grid.count();
    if (gridCount === 0) continue; // empty page
    // grid のスタイルが grid-template-columns 2列か確認
    const cols = await grid.first().evaluate(
      (el) => getComputedStyle(el as HTMLElement).gridTemplateColumns
    );
    const colCount = cols.split(' ').length;
    console.log(`${path}: gridTemplateColumns="${cols}" (${colCount} cols)`);
    expect(colCount).toBe(2);
  }
  await ctx.close();
});
