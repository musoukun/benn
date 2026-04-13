import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 4 E2E: OGP
// - 外部 URL の OGP fetch
// - 内部記事 / 投稿の OGP 画像生成 (PNG)
// - PostCard のリッチ URL カードに OGP 取得結果が出る

const SHOTS_DIR = path.join(process.cwd(), 'screenshots', 'ogp');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
let _i = 0;
function shotPath(name: string) {
  _i++;
  return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${name}.png`);
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: false });
}

async function reg(ctx: BrowserContext, prefix: string) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const email = `${prefix}-${stamp}@example.test`;
  const password = 'pwpwpwpw-' + stamp;
  const name = `${prefix}-${stamp}`;
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
  return { page, email, name };
}

test.describe('Phase4 OGP', () => {
  test.setTimeout(180_000);

  test('外部 OGP fetch + Uchi 内 OGP 画像生成 + リッチ URL カード', async ({ browser }) => {
    const ctx = await browser.newContext();
    const alice = await reg(ctx, 'ogp-a');

    // ---------- 外部 OGP fetch ----------
    const r = await alice.page.request.get('/api/ogp?url=https%3A%2F%2Fexample.com');
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    console.log('external OGP:', j);
    expect(j.host).toBe('example.com');
    expect(j.title).toContain('Example');

    // 不正 URL は 400
    const bad = await alice.page.request.get('/api/ogp?url=not-a-url');
    expect(bad.status()).toBe(400);

    // ---------- 記事を作って OGP PNG が返ること ----------
    const ar = await alice.page.request.post('/api/articles', {
      data: {
        title: 'OGP テスト記事 — 自動生成された OGP 画像が出るはず',
        emoji: '🖼',
        type: 'howto',
        body: 'OGP 画像生成のテスト記事です。Satori + resvg で動的に PNG が返ります。',
        topicNames: ['ogp'],
        published: true,
        visibility: 'public',
      },
    });
    expect(ar.ok()).toBeTruthy();
    const article = await ar.json();
    console.log('article id:', article.id);

    const png = await alice.page.request.get(`/api/ogp/articles/${article.id}/image`);
    expect(png.ok(), 'OGP png status: ' + png.status()).toBeTruthy();
    expect(png.headers()['content-type']).toBe('image/png');
    const buf = await png.body();
    console.log('OGP png bytes:', buf.length);
    expect(buf.length).toBeGreaterThan(2000);
    // PNG magic 0x89 0x50 0x4E 0x47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
    fs.writeFileSync(path.join(SHOTS_DIR, '01-ogp-article.png'), buf);

    // 2回目はキャッシュヒット
    const png2 = await alice.page.request.get(`/api/ogp/articles/${article.id}/image`);
    expect(png2.ok()).toBeTruthy();

    // ---------- Post 用 OGP ----------
    // private community 内で投稿してから OGP PNG を取る
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: 'ogp-club-' + Date.now(), description: '', visibility: 'private' },
    });
    const com = await cr.json();
    const pr = await alice.page.request.post('/api/posts', {
      data: { body: 'OGP 投稿テスト! Uchi の動的 OGP 画像 がこれで出る', communityId: com.id },
    });
    const post = await pr.json();
    const ppng = await alice.page.request.get(`/api/ogp/posts/${post.id}/image`);
    expect(ppng.ok()).toBeTruthy();
    const pbuf = await ppng.body();
    console.log('post OGP png bytes:', pbuf.length);
    expect(pbuf.length).toBeGreaterThan(2000);
    fs.writeFileSync(path.join(SHOTS_DIR, '02-ogp-post.png'), pbuf);

    // ---------- リッチ URL カード (OGP 取得結果が PostCard に出る) ----------
    // example.com を含む post を作って、PostCard に飛んで rich card が出ることを確認
    const pr2 = await alice.page.request.post('/api/posts', {
      data: { body: '外部 URL リッチカードのテスト\n\nhttps://example.com', communityId: com.id },
    });
    await alice.page.goto(`/communities/${com.id}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    // OGP fetch を待つ
    await alice.page.waitForTimeout(2000);
    await shot(alice.page, '03-rich-url-card');

    // post-url-card-title に "Example" が含まれる
    const card = alice.page.locator('.post-url-card.rich').first();
    await expect(card).toBeVisible({ timeout: 8000 });
    await expect(card.locator('.post-url-card-title')).toContainText('Example');

    console.log('SHOTS:', fs.readdirSync(SHOTS_DIR).sort().join('\n'));
    await ctx.close();
  });
});
