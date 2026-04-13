import { test, expect } from '@playwright/test';
import { createArticleViaApi, registerAndLogin } from './helpers';

// E2E_GEMINI_KEY が無ければ skip
const KEY = process.env.E2E_GEMINI_KEY || '';

test.describe('AI機能 (Gemini gemini-2.5-flash)', () => {
  test.skip(!KEY, 'E2E_GEMINI_KEY not set — skipping AI tests');
  // LLM 呼び出しは長め
  test.setTimeout(180_000);

  test('AIレビュー (API)', async ({ page }) => {
    await registerAndLogin(page, 'ai-rv');
    const cfg = await page.request.post('/api/ai/configs', {
      data: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: KEY, isDefault: true },
    });
    expect(cfg.ok()).toBeTruthy();

    const a = await createArticleViaApi(page, {
      title: 'AIレビューのテスト記事',
      body:
        '# はじめに\n\n' +
        'これはテスト用の記事ですをで動作確認しています。\n' +
        '\n## 内容\n\n' +
        'Markdownでの記事執筆ををサポートしています。\n' +
        '\n## まとめ\n\n' +
        '以上、テストでした。',
      topicNames: ['ai-test'],
    });

    // body 無しだと Hono csrf が Origin を見られず弾くので空 JSON を渡す
    const r = await page.request.post(`/api/ai/articles/${a.id}/review`, { data: {} });
    expect(r.ok(), `review failed: ${r.status()} ${await r.text()}`).toBeTruthy();
    const j = await r.json();
    console.log('REVIEW RESULT:', JSON.stringify(j).slice(0, 500));
    expect(j).toHaveProperty('summary');
    expect(typeof j.summary).toBe('string');
    expect(j.summary.length).toBeGreaterThan(5);
  });

  test('要約 (API)', async ({ page }) => {
    await registerAndLogin(page, 'ai-sum');
    await page.request.post('/api/ai/configs', {
      data: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: KEY, isDefault: true },
    });
    const a = await createArticleViaApi(page, {
      title: '要約テスト記事',
      body: 'これはE2Eテスト用の短い記事です。Uchiは身内向けの技術ブログSNSで、SQLite + Hono + React で動きます。',
      topicNames: ['e2e'],
    });

    const r = await page.request.post('/api/ai/summarize', {
      data: { articleIds: [a.id] },
    });
    expect(r.ok(), `summarize failed: ${r.status()} ${await r.text()}`).toBeTruthy();
    const j = await r.json();
    console.log('SUMMARY RESULT:', JSON.stringify(j).slice(0, 500));
    expect(j.items).toHaveLength(1);
    expect(j.items[0].summary.length).toBeGreaterThan(10);
    expect(j.items[0].summary).not.toMatch(/要約失敗/);
  });

  test('AIレビュー (UI 表示まで)', async ({ page }) => {
    await registerAndLogin(page, 'ai-rv-ui');
    await page.request.post('/api/ai/configs', {
      data: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: KEY, isDefault: true },
    });
    const a = await createArticleViaApi(page, {
      title: 'UIレビュー記事',
      body: '# h\n\nこれはテスト記事ですをで動作確認します。',
      topicNames: ['ai-test'],
    });

    // alert を自動受諾 (失敗時に出る)
    page.on('dialog', (d) => d.accept());

    await page.goto(`/articles/${a.id}`);
    await page.getByRole('button', { name: /AIレビュー$/ }).click();

    // 結果ヘッダーが出るまで待つ
    await expect(page.getByRole('heading', { name: 'AIレビュー' })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('text=講評')).toBeVisible();
  });
});
