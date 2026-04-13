import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// まとめ記事作成の 2 ボタン (通常記事 / コミュニティ投稿) のテスト

async function registerInContext(
  ctx: BrowserContext,
  prefix: string
): Promise<{ page: Page; userId: string }> {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 10_000 });
  const me = await page.request.get('/api/me');
  const j = await me.json();
  return { page, userId: j.id };
}

test.describe('まとめ記事の2つの投稿先', () => {
  test.setTimeout(120_000);

  test('通常記事ボタンとコミュニティ投稿ボタンが両方動く', async ({ browser }) => {
    const ctx = await browser.newContext();
    const { page, userId } = await registerInContext(ctx, 'agg');

    // コミュニティを作成
    const cRes = await page.request.post('/api/communities', {
      data: { name: 'agg-test-' + Date.now(), visibility: 'public' },
    });
    expect(cRes.ok()).toBeTruthy();
    const community = await cRes.json();

    // テスト用記事を2つ作成
    for (const title of ['テスト記事A', 'テスト記事B']) {
      const r = await page.request.post('/api/articles', {
        data: {
          title,
          emoji: '📝',
          type: 'howto',
          body: `# ${title}\n本文`,
          topicNames: ['test'],
          published: true,
          visibility: 'public',
        },
      });
      expect(r.ok()).toBeTruthy();
    }

    // ========== まとめ記事作成ページに移動 ==========
    await page.goto('/me/aggregate');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 検索して記事を選択
    await page.locator('input[placeholder="検索"]').fill('テスト記事');
    await page.getByRole('button', { name: '検索' }).click();
    await page.waitForTimeout(500);

    // チェックボックスで2つ選択
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    // 最初の2つのチェックボックスを選択 (AI要約チェックボックスを除く)
    let checked = 0;
    for (let i = 0; i < count && checked < 2; i++) {
      const cb = checkboxes.nth(i);
      const parent = cb.locator('..');
      const text = await parent.textContent();
      if (text?.includes('テスト記事')) {
        await cb.check();
        checked++;
      }
    }
    expect(checked).toBe(2);

    // ========== テスト 1: 「まとめ記事を作る」ボタンが存在する ==========
    const articleBtn = page.getByRole('button', { name: 'まとめ記事を作る' });
    await expect(articleBtn).toBeVisible();
    await expect(articleBtn).toBeEnabled();

    // ========== テスト 2: 「まとめコミュニティ投稿を作る」ボタンが存在する ==========
    const communityBtn = page.getByRole('button', { name: 'まとめコミュニティ投稿を作る' });
    await expect(communityBtn).toBeVisible();

    // 記事を選択済みでもコミュニティ未選択なら disabled
    await expect(communityBtn).toBeDisabled();

    // ========== テスト 3: プルダウンでコミュニティを選択 → ボタンが活性化 ==========
    const communitySelect = page.locator('select').filter({ has: page.locator(`option[value="${community.id}"]`) });
    await communitySelect.selectOption(community.id);
    await expect(communityBtn).toBeEnabled();

    // ========== テスト 4: ボタンを押すとエディタに遷移する ==========
    await communityBtn.click();
    await page.waitForURL(
      new RegExp(`/communities/${community.id}/editor\\?prefill=1`),
      { timeout: 15_000 }
    );

    // CommunityEditorPage に遷移してプリフィルされている
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('textarea').first().inputValue().catch(() => '');
    expect(bodyText.length).toBeGreaterThan(0);
    console.log('Prefilled body length:', bodyText.length);

    // ========== テスト 5: 通常記事ボタンは /editor に遷移する ==========
    await page.goto('/me/aggregate');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 再度検索して選択
    await page.locator('input[placeholder="検索"]').fill('テスト記事');
    await page.getByRole('button', { name: '検索' }).click();
    await page.waitForTimeout(500);

    checked = 0;
    const checkboxes2 = page.locator('input[type="checkbox"]');
    const count2 = await checkboxes2.count();
    for (let i = 0; i < count2 && checked < 1; i++) {
      const cb = checkboxes2.nth(i);
      const parent = cb.locator('..');
      const text = await parent.textContent();
      if (text?.includes('テスト記事')) {
        await cb.check();
        checked++;
      }
    }

    await page.getByRole('button', { name: 'まとめ記事を作る' }).click();
    await page.waitForURL(/\/editor\?prefill=1/, { timeout: 15_000 });

    // EditorPage に遷移してプリフィルされている
    await page.waitForTimeout(1000);
    const bodyText2 = await page.locator('textarea').first().inputValue().catch(() => '');
    expect(bodyText2.length).toBeGreaterThan(0);
    console.log('Article editor prefilled body length:', bodyText2.length);

    await ctx.close();
    console.log('OK: aggregate 2-button test passed');
  });
});
