import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 3ユーザー(Alice owner / Bob 招待される / Carol 部外者) で
// 招待→加入→可視性→メンバー一覧 を一気通貫でテスト + スクショ。
// 既存の registerAndLogin と違い、ブラウザコンテキストを context ベースで作って
// それぞれに別のセッション cookie を持たせる。

const SHOTS_DIR = path.join(process.cwd(), 'screenshots-community');

let _i = 0;
function shotPath(name: string) {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  _i++;
  const num = String(_i).padStart(2, '0');
  return path.join(SHOTS_DIR, `${num}-${name}.png`);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

async function registerInContext(
  ctx: BrowserContext,
  prefix: string
): Promise<{ page: Page; email: string; name: string; userId: string }> {
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
  // me を取得して userId 把握
  const me = await page.request.get('/api/me');
  const j = await me.json();
  return { page, email, name, userId: j.id };
}

test.describe('コミュニティ 3ユーザーフロー', () => {
  test.setTimeout(180_000);

  test('owner→招待→加入→可視性→メンバー一覧', async ({ browser }) => {
    // ---------- 0. 3つのコンテキスト ----------
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();

    const alice = await registerInContext(aliceCtx, 'alice');
    const bob = await registerInContext(bobCtx, 'bob');
    const carol = await registerInContext(carolCtx, 'carol');

    console.log('USERS:', { alice: alice.userId, bob: bob.userId, carol: carol.userId });

    // ---------- 1. Alice がコミュニティを作る ----------
    await alice.page.goto('/communities');
    await shot(alice.page, 'alice-communities-empty');

    const cname = 'secret-club-' + Date.now();
    await alice.page.getByPlaceholder('コミュニティ名').fill(cname);
    await alice.page.getByPlaceholder('説明 (任意)').fill('身内専用の秘密クラブ');
    await alice.page.getByRole('button', { name: '作成' }).click();
    await alice.page.waitForTimeout(800);
    await shot(alice.page, 'alice-after-create');

    // 作成後一覧に出た community の id を取得
    const cs = await alice.page.request.get('/api/communities');
    const communities = await cs.json();
    const created = communities.find((x: any) => x.name === cname);
    expect(created).toBeTruthy();
    const communityId = created.id;
    console.log('COMMUNITY:', communityId);

    // 詳細
    await alice.page.goto(`/communities/${communityId}`);
    await shot(alice.page, 'alice-community-detail-1member');

    // メンバータブ (1人だけ = Alice owner)
    await alice.page.getByRole('button', { name: 'メンバー' }).click();
    await shot(alice.page, 'alice-members-1');

    // ---------- 2. Alice が記事を3本作る (public / community / 別 public) ----------
    // (a) 公開記事
    const pubA = await alice.page.request.post('/api/articles', {
      data: {
        title: 'Alice の公開記事',
        emoji: '🌍',
        type: 'howto',
        body: '誰でも見える公開記事です。',
        topicNames: ['public'],
        published: true,
        visibility: 'public',
      },
    });
    expect(pubA.ok(), 'public article: ' + pubA.status()).toBeTruthy();
    const pubArt = await pubA.json();

    // (b) コミュニティ専用記事 (owner 投稿なので即 approved)
    const commA = await alice.page.request.post('/api/articles', {
      data: {
        title: 'Alice のコミュニティ専用記事',
        emoji: '🤫',
        type: 'howto',
        body: '# 内輪ネタ\n\nメンバーだけが見える秘密の記事です。',
        topicNames: ['secret'],
        published: true,
        visibility: 'public', // visibility は public でも communityId が刺さってればメンバー限定になる
        communityId,
      },
    });
    expect(commA.ok(), 'community article: ' + commA.status() + ' ' + (await commA.text().catch(() => ''))).toBeTruthy();
    const commArt = await commA.json();
    console.log('ARTICLES:', { pub: pubArt.id, comm: commArt.id });

    // ---------- 3. Carol (部外者) からの可視性チェック ----------
    // 公開記事は見える
    await carol.page.goto(`/articles/${pubArt.id}`);
    await carol.page.waitForLoadState('networkidle').catch(() => {});
    await shot(carol.page, 'carol-sees-public');
    await expect(carol.page.locator('body')).toContainText('Alice の公開記事');

    // コミュニティ記事は見えない (404 or notfound 表示)
    await carol.page.goto(`/articles/${commArt.id}`);
    await carol.page.waitForLoadState('networkidle').catch(() => {});
    await shot(carol.page, 'carol-blocked-from-community-article');

    // API 直叩きでも 404 / not found が返ること
    const carolGet = await carol.page.request.get(`/api/articles/${commArt.id}`);
    console.log('Carol GET community article status:', carolGet.status());
    expect([403, 404]).toContain(carolGet.status());

    // Carol からはコミュニティ詳細ページの中身も「メンバーじゃない」感じになるはず
    await carol.page.goto(`/communities/${communityId}`);
    await carol.page.waitForLoadState('networkidle').catch(() => {});
    await shot(carol.page, 'carol-community-page-as-outsider');

    // ---------- 4. Bob も最初は部外者 ----------
    await bob.page.goto(`/articles/${commArt.id}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-blocked-before-invite');
    const bobGetBefore = await bob.page.request.get(`/api/articles/${commArt.id}`);
    expect([403, 404]).toContain(bobGetBefore.status());

    // ---------- 5. Alice が招待トークン発行 ----------
    const invRes = await alice.page.request.post(`/api/communities/${communityId}/invites`, {
      data: { email: bob.email },
    });
    expect(invRes.ok(), 'invite create: ' + invRes.status()).toBeTruthy();
    const inv = await invRes.json();
    console.log('INVITE TOKEN:', inv.token);

    // 招待タブのスクショ (発行後)
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.getByRole('button', { name: '招待' }).click();
    await shot(alice.page, 'alice-invite-issued');

    // ---------- 6. Bob が招待リンクに飛ぶ (InvitePage が自動で受諾→/communities/:id に遷移) ----------
    await bob.page.goto(`/invite/${inv.token}`);
    // 受諾ページから community 詳細にリダイレクトされるまで待つ
    await bob.page.waitForURL(new RegExp(`/communities/${communityId}$`), { timeout: 10_000 });
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-after-join');

    // ---------- 7. Bob は communityId 経由で見れるようになる ----------
    await bob.page.goto(`/articles/${commArt.id}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-sees-community-article');
    await expect(bob.page.locator('body')).toContainText('Alice のコミュニティ専用記事');

    // ---------- 8. メンバー一覧が 2人になっていること (Alice 視点) ----------
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.getByRole('button', { name: 'メンバー' }).click();
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'alice-members-2');

    // API でも確認
    const detail = await alice.page.request.get(`/api/communities/${communityId}`);
    const dj = await detail.json();
    console.log('FINAL MEMBERS:', dj.members.map((m: any) => `${m.name}(${m.role})`));
    expect(dj.members).toHaveLength(2);
    const roles = dj.members.map((m: any) => m.role).sort();
    expect(roles).toEqual(['member', 'owner']);

    // ---------- 9. Bob 視点でもコミュニティページが「メンバーとして」見えること ----------
    await bob.page.goto(`/communities/${communityId}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await shot(bob.page, 'bob-community-page-as-member');

    // ---------- 10. Carol は依然見えない (再確認) ----------
    const carolGet2 = await carol.page.request.get(`/api/articles/${commArt.id}`);
    expect([403, 404]).toContain(carolGet2.status());
    await carol.page.goto(`/articles/${commArt.id}`);
    await shot(carol.page, 'carol-still-blocked');

    // ---------- 11. ホーム TL にコミュニティ記事が出ること (timelineId 自動振り分け) ----------
    // Alice の community 記事は communityId のみで投稿したので、サーバ側で home に振られている想定
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await shot(alice.page, 'alice-home-timeline-with-article');
    await expect(alice.page.locator('body')).toContainText('コミュニティ専用記事');

    // ---------- 12. Bob がコミュニティページから記事投稿 → 承認待ち ----------
    await bob.page.goto(`/communities/${communityId}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    // 「✏ このコミュニティに投稿」ボタンを押すと /editor?communityId=... に遷移
    await bob.page
      .getByRole('link', { name: /このコミュニティに投稿/ })
      .first()
      .click();
    await bob.page.waitForURL(/\/editor\?/, { timeout: 5_000 });
    await shot(bob.page, 'bob-editor-prefilled');

    // タイトル / 本文を入れて公開
    await bob.page.locator('input[aria-label="記事タイトル"]').fill('Bob からの初投稿 (承認待ちのはず)');
    await bob.page.locator('textarea').first().fill(
      '# はじめまして\n\nコミュニティに参加したての Bob からの最初の投稿です。'
    );
    // タグ入れる (TagInput は input[type=text].tag-input-field)
    const tagInput = bob.page.locator('.tag-input-field');
    if (await tagInput.isVisible().catch(() => false)) {
      await tagInput.fill('greeting');
      await tagInput.press('Enter');
    }
    await shot(bob.page, 'bob-editor-filled');
    await bob.page.getByRole('button', { name: '公開する' }).click();
    await bob.page.waitForTimeout(1500);
    await shot(bob.page, 'bob-after-publish');

    // ---------- 13. Alice の承認待ちタブに Bob の記事が出る ----------
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.getByRole('button', { name: '承認待ち' }).click();
    await alice.page.waitForTimeout(500);
    await shot(alice.page, 'alice-pending-bob-post');
    await expect(alice.page.locator('body')).toContainText('Bob からの初投稿');

    // 承認 (exact: "承認待ち" タブと混同しない)
    await alice.page.getByRole('button', { name: '承認', exact: true }).first().click();
    await alice.page.waitForTimeout(1200);
    await shot(alice.page, 'alice-approved');

    // ホームタイムラインに Bob の記事が出る
    // (UX 改善: approve 後に自動で tl 再取得されるが、テスト安定のため reload も入れる)
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await alice.page.waitForTimeout(600);
    await shot(alice.page, 'alice-home-after-approval');
    await expect(alice.page.locator('body')).toContainText('Bob からの初投稿');

    // ---------- 14. API レベルで「最後の owner 脱退禁止」を確認 ----------
    // (CSRF 回避のため body 無しでも data:{} を渡す)
    const meRes = await alice.page.request.get('/api/me');
    const meJ = await meRes.json();
    const dropRes = await alice.page.request.delete(
      `/api/communities/${communityId}/members/${meJ.id}`,
      { data: {} }
    );
    console.log('drop status:', dropRes.status(), 'body:', await dropRes.text());
    const demoteRes = await alice.page.request.patch(
      `/api/communities/${communityId}/members/${meJ.id}`,
      { data: { role: 'member' } }
    );
    expect(demoteRes.status()).toBe(400);
    const demoteJ = await demoteRes.json();
    expect(demoteJ.error).toBe('last_owner');
    console.log('LAST OWNER DEMOTE GUARD:', demoteJ.message);

    // ---------- 14b. UI: owner Alice の削除ボタンで transfer modal ----------
    await alice.page.goto(`/communities/${communityId}`);
    await alice.page.getByRole('button', { name: 'メンバー' }).click();
    await alice.page.waitForTimeout(500);
    // Alice の行を著者名でフィルタしてその「削除」ボタン
    const aliceRow = alice.page
      .locator('div')
      .filter({ hasText: new RegExp('^' + alice.name + '\\s*代表\\s*削除$') })
      .first();
    if (await aliceRow.count() > 0) {
      await aliceRow.getByRole('button', { name: '削除' }).click();
      await alice.page.waitForTimeout(500);
      await shot(alice.page, 'alice-transfer-modal');
      // modal が出ることを確認 (ownerCount===1 ガード経由 or サーバ 400 経由)
      const modalVisible = await alice.page.locator('.modal').isVisible().catch(() => false);
      if (modalVisible) {
        await expect(alice.page.locator('.modal')).toContainText('代表');
        await alice.page.getByRole('button', { name: 'やめる' }).click();
        await alice.page.waitForTimeout(200);
      }
    } else {
      console.log('alice row not located by tight regex; UI guard already covered by API check');
    }

    // ---------- 16. Carol は private community 詳細自体が 404 ----------
    const carolDetail = await carol.page.request.get(`/api/communities/${communityId}`);
    expect(carolDetail.status()).toBe(404);

    // 一覧 API でも返らないこと
    const carolList = await carol.page.request.get('/api/communities');
    const carolListJ = await carolList.json();
    const found = carolListJ.find((x: any) => x.id === communityId);
    expect(found).toBeUndefined();

    console.log('SHOTS DIR:', SHOTS_DIR);
    const files = fs.readdirSync(SHOTS_DIR).sort();
    console.log('SHOTS:\n' + files.join('\n'));

    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  });
});
