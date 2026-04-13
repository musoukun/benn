import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// タイムライン可視性テスト (X モデル)
// 3 ユーザー: Alice (owner) / Bob (メンバー) / Carol (部外者)
//
// テスト観点:
//   1. public TL → Carol (非メンバー) でも記事/投稿が見える
//   2. members_only (鍵) TL → Carol は見えない、Bob は見える
//   3. selected_users TL → コミュニティ外の Carol を指定 → Carol だけ見える、Bob は見えない

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
  const me = await page.request.get('/api/me');
  const j = await me.json();
  return { page, email, name, userId: j.id };
}

test.describe('タイムライン可視性 (X モデル)', () => {
  test.setTimeout(180_000);

  test('public / members_only / selected_users の可視性が正しく動く', async ({ browser }) => {
    // ========== 0. ユーザー準備 ==========
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();

    const alice = await registerInContext(aliceCtx, 'tl-alice');
    const bob = await registerInContext(bobCtx, 'tl-bob');
    const carol = await registerInContext(carolCtx, 'tl-carol');
    console.log('USERS:', { alice: alice.userId, bob: bob.userId, carol: carol.userId });

    // ========== 1. Alice が public コミュニティを作る ==========
    const cname = 'tl-test-' + Date.now();
    const createRes = await alice.page.request.post('/api/communities', {
      data: { name: cname, description: 'タイムラインテスト用', visibility: 'public' },
    });
    expect(createRes.ok()).toBeTruthy();
    const community = await createRes.json();
    const cid = community.id;
    console.log('COMMUNITY:', cid);

    // Bob をメンバーに追加
    const addBob = await alice.page.request.post(`/api/communities/${cid}/members`, {
      data: { userId: bob.userId },
    });
    expect(addBob.ok()).toBeTruthy();

    // ========== 2. Alice が 3 つのタイムラインを作る ==========

    // (a) public TL
    const pubTlRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: { name: '公開チャンネル', visibility: 'public' },
    });
    expect(pubTlRes.ok()).toBeTruthy();
    const pubTl = await pubTlRes.json();
    console.log('PUBLIC TL:', pubTl.id);

    // (b) members_only TL (鍵)
    const lockTlRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: { name: '鍵チャンネル', visibility: 'members_only' },
    });
    expect(lockTlRes.ok()).toBeTruthy();
    const lockTl = await lockTlRes.json();
    console.log('LOCKED TL:', lockTl.id);

    // (c) selected_users TL — Carol (コミュニティ外) を指定
    const selTlRes = await alice.page.request.post(`/api/communities/${cid}/timelines`, {
      data: {
        name: '指定ユーザーチャンネル',
        visibility: 'selected_users',
        visibilityUserIds: [carol.userId],
      },
    });
    expect(selTlRes.ok()).toBeTruthy();
    const selTl = await selTlRes.json();
    console.log('SELECTED TL:', selTl.id);

    // ========== 3. 各 TL に記事を投稿 (Alice = owner なので即 approved) ==========
    const postArticle = async (title: string, timelineId: string) => {
      const res = await alice.page.request.post('/api/articles', {
        data: {
          title,
          emoji: '📝',
          type: 'howto',
          body: `# ${title}\n\nテスト本文`,
          topicNames: ['test'],
          published: true,
          visibility: 'public',
          communityId: cid,
          timelineId,
        },
      });
      expect(res.ok(), `article create "${title}": ${res.status()}`).toBeTruthy();
      return res.json();
    };

    const pubArt = await postArticle('公開TLの記事', pubTl.id);
    const lockArt = await postArticle('鍵TLの記事', lockTl.id);
    const selArt = await postArticle('指定ユーザーTLの記事', selTl.id);
    console.log('ARTICLES:', { pub: pubArt.id, lock: lockArt.id, sel: selArt.id });

    // ========== 4. 各 TL に SNS 投稿 (Post) ==========
    const postSns = async (body: string, timelineId: string) => {
      const res = await alice.page.request.post('/api/posts', {
        data: { body, communityId: cid, timelineId },
      });
      const text = await res.text();
      expect(res.ok(), `post create: ${res.status()} ${text}`).toBeTruthy();
      return JSON.parse(text);
    };

    await postSns('公開TLの投稿です', pubTl.id);
    await postSns('鍵TLの投稿です', lockTl.id);
    await postSns('指定ユーザーTLの投稿です', selTl.id);

    // ========== 5. Carol (非メンバー) の可視性チェック ==========

    // 5a. public TL の記事一覧 → 見える
    const carolPubArts = await carol.page.request.get(
      `/api/communities/${cid}/timelines/${pubTl.id}/articles`
    );
    expect(carolPubArts.ok(), 'Carol sees public TL articles').toBeTruthy();
    const carolPubArtList = await carolPubArts.json();
    expect(carolPubArtList.length).toBeGreaterThanOrEqual(1);
    expect(carolPubArtList.some((a: any) => a.title === '公開TLの記事')).toBeTruthy();

    // 5b. public TL の投稿一覧 → 見える
    const carolPubPosts = await carol.page.request.get(`/api/posts/timeline/${pubTl.id}`);
    expect(carolPubPosts.ok(), 'Carol sees public TL posts').toBeTruthy();
    const carolPubPostList = await carolPubPosts.json();
    expect(carolPubPostList.some((p: any) => p.body.includes('公開TLの投稿'))).toBeTruthy();

    // 5c. members_only TL → 見えない (403)
    const carolLockArts = await carol.page.request.get(
      `/api/communities/${cid}/timelines/${lockTl.id}/articles`
    );
    expect(carolLockArts.status()).toBe(403);

    const carolLockPosts = await carol.page.request.get(`/api/posts/timeline/${lockTl.id}`);
    expect(carolLockPosts.status()).toBe(403);

    // 5d. selected_users TL — Carol は visibilityUserIds に含まれているので見える
    const carolSelArts = await carol.page.request.get(
      `/api/communities/${cid}/timelines/${selTl.id}/articles`
    );
    expect(carolSelArts.ok(), 'Carol sees selected_users TL (she is designated)').toBeTruthy();
    const carolSelArtList = await carolSelArts.json();
    expect(carolSelArtList.some((a: any) => a.title === '指定ユーザーTLの記事')).toBeTruthy();

    const carolSelPosts = await carol.page.request.get(`/api/posts/timeline/${selTl.id}`);
    expect(carolSelPosts.ok()).toBeTruthy();

    // ========== 6. Bob (メンバー) の可視性チェック ==========

    // 6a. public TL → 見える
    const bobPubArts = await bob.page.request.get(
      `/api/communities/${cid}/timelines/${pubTl.id}/articles`
    );
    expect(bobPubArts.ok()).toBeTruthy();

    // 6b. members_only TL → メンバーなので見える
    const bobLockArts = await bob.page.request.get(
      `/api/communities/${cid}/timelines/${lockTl.id}/articles`
    );
    expect(bobLockArts.ok(), 'Bob sees locked TL (he is a member)').toBeTruthy();
    const bobLockArtList = await bobLockArts.json();
    expect(bobLockArtList.some((a: any) => a.title === '鍵TLの記事')).toBeTruthy();

    // 6c. selected_users TL → Bob は指定されていないので見えない
    const bobSelArts = await bob.page.request.get(
      `/api/communities/${cid}/timelines/${selTl.id}/articles`
    );
    expect(bobSelArts.status(), 'Bob cannot see selected_users TL (not designated)').toBe(403);

    // ========== 7. コミュニティ詳細 API の timelines フィルタ確認 ==========

    // Carol: public TL + selected_users TL (指定済み) のみ見える
    const carolDetail = await carol.page.request.get(`/api/communities/${cid}`);
    expect(carolDetail.ok()).toBeTruthy();
    const carolDetailJ = await carolDetail.json();
    const carolTlNames = carolDetailJ.timelines.map((t: any) => t.name);
    console.log('Carol visible TLs:', carolTlNames);
    expect(carolTlNames).toContain('公開チャンネル');
    expect(carolTlNames).not.toContain('鍵チャンネル');
    expect(carolTlNames).toContain('指定ユーザーチャンネル');

    // Bob: public + ホーム + members_only は見える、selected_users は見えない
    const bobDetail = await bob.page.request.get(`/api/communities/${cid}`);
    const bobDetailJ = await bobDetail.json();
    const bobTlNames = bobDetailJ.timelines.map((t: any) => t.name);
    console.log('Bob visible TLs:', bobTlNames);
    expect(bobTlNames).toContain('公開チャンネル');
    expect(bobTlNames).toContain('鍵チャンネル');
    expect(bobTlNames).toContain('ホーム');
    expect(bobTlNames).not.toContain('指定ユーザーチャンネル');

    // Alice (owner): 全部見える
    const aliceDetail = await alice.page.request.get(`/api/communities/${cid}`);
    const aliceDetailJ = await aliceDetail.json();
    const aliceTlNames = aliceDetailJ.timelines.map((t: any) => t.name);
    console.log('Alice visible TLs:', aliceTlNames);
    expect(aliceTlNames).toContain('公開チャンネル');
    expect(aliceTlNames).toContain('鍵チャンネル');
    expect(aliceTlNames).toContain('指定ユーザーチャンネル');
    expect(aliceTlNames).toContain('ホーム');

    // ========== 8. TL visibility の変更テスト ==========
    // 鍵 TL を public に変更 → Carol から見えるようになる
    const patchRes = await alice.page.request.patch(
      `/api/communities/${cid}/timelines/${lockTl.id}`,
      { data: { visibility: 'public' } }
    );
    expect(patchRes.ok()).toBeTruthy();
    const patchedTl = await patchRes.json();
    expect(patchedTl.visibility).toBe('public');

    const carolLockAfter = await carol.page.request.get(
      `/api/communities/${cid}/timelines/${lockTl.id}/articles`
    );
    expect(carolLockAfter.ok(), 'Carol sees formerly-locked TL after it became public').toBeTruthy();

    // ========== 9. private コミュニティでも public TL を作れることを確認 ==========
    const privCommunityRes = await alice.page.request.post('/api/communities', {
      data: { name: 'private-tl-test-' + Date.now(), description: 'private with public TL', visibility: 'private' },
    });
    expect(privCommunityRes.ok()).toBeTruthy();
    const privCommunity = await privCommunityRes.json();

    const privPubTlRes = await alice.page.request.post(
      `/api/communities/${privCommunity.id}/timelines`,
      { data: { name: '外向き発信', visibility: 'public' } }
    );
    expect(privPubTlRes.ok(), 'Can create public TL in private community').toBeTruthy();
    const privPubTl = await privPubTlRes.json();
    expect(privPubTl.visibility).toBe('public');

    // cleanup
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
    console.log('✅ Timeline visibility tests passed');
  });
});
