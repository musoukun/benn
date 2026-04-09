import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 2 E2E: コメント機能
// - article と post の両方にコメントが付くこと
// - 親コメント → 返信 (1段インデント)
// - 返信への返信は子と同階層 (フラット) で並ぶ
// - 編集 / 削除

const SHOTS_DIR = path.join(process.cwd(), 'screenshots-comment');
let _i = 0;
function shotPath(name: string) {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  _i++;
  return path.join(SHOTS_DIR, `${String(_i).padStart(2, '0')}-${name}.png`);
}
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(name), fullPage: true });
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
  const me = await (await page.request.get('/api/me')).json();
  return { page, email, name, userId: me.id };
}

test.describe('Phase2 コメント機能', () => {
  test.setTimeout(180_000);

  test('article + post にコメント / 返信 / 編集 / 削除', async ({ browser }) => {
    const aCtx = await browser.newContext();
    const bCtx = await browser.newContext();
    const alice = await reg(aCtx, 'cmt-a');
    const bob = await reg(bCtx, 'cmt-b');

    // ---------- article 側 ----------
    // alice が記事を作る
    const ar = await alice.page.request.post('/api/articles', {
      data: {
        title: 'コメントテスト記事',
        emoji: '🗨',
        type: 'howto',
        body: '# はじめに\n\nコメント機能の動作確認です。',
        topicNames: ['comment-test'],
        published: true,
        visibility: 'public',
      },
    });
    expect(ar.ok()).toBeTruthy();
    const article = await ar.json();

    // bob がコメント
    await bob.page.goto(`/articles/${article.id}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    await bob.page.locator('.comment-composer textarea').fill('**素晴らしい記事**ですね！');
    await shot(bob.page, 'bob-article-composing');
    await bob.page.locator('.comment-composer').getByRole('button', { name: '投稿する' }).click();
    await bob.page.waitForTimeout(800);
    await shot(bob.page, 'bob-article-commented');

    // markdown の strong がレンダリングされている
    await expect(bob.page.locator('.comment-row .comment-body strong').first()).toContainText('素晴らしい記事');

    // alice がプレビュータブに切り替えてからコメント
    await alice.page.goto(`/articles/${article.id}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await alice.page.locator('.comment-composer textarea').fill('ありがとうございます！\n\n- 嬉しい\n- 助かる');
    // プレビュータブに切り替え
    await alice.page.locator('.comment-composer .tab-btn', { hasText: 'プレビュー' }).click();
    await shot(alice.page, 'alice-preview-tab');
    await expect(alice.page.locator('.comment-preview li').first()).toContainText('嬉しい');
    // 戻して投稿
    await alice.page.locator('.comment-composer .tab-btn', { hasText: 'Markdown' }).click();
    await alice.page.locator('.comment-composer').getByRole('button', { name: '投稿する' }).click();
    await alice.page.waitForTimeout(800);

    // ---------- 返信 (1段インデント) ----------
    // bob のコメント行で「返信」ボタンを押して返信を書く
    await bob.page.goto(`/articles/${article.id}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    // alice のコメントに返信
    const aliceRow = bob.page
      .locator('.comment-row')
      .filter({ hasText: 'ありがとうございます' })
      .first();
    await aliceRow.getByRole('button', { name: /返信/ }).click();
    await bob.page.waitForTimeout(300);
    // 返信用 composer が出現
    const replyComposer = bob.page.locator('.comment-row .comment-composer').first();
    await replyComposer.locator('textarea').fill('こちらこそ！追加で質問させてください。');
    await shot(bob.page, 'bob-replying');
    await replyComposer.getByRole('button', { name: '投稿する' }).click();
    await bob.page.waitForTimeout(800);
    await shot(bob.page, 'bob-replied-1-level-indent');

    // 1段インデント部分 (.comment-replies) に Bob の返信が入ってる
    const replies = bob.page.locator('.comment-replies').first();
    await expect(replies).toContainText('こちらこそ');

    // ---------- 返信への返信 (子と同列でフラット) ----------
    // alice が bob の返信に返信 → 仕様上、子に並列で追加される (孫として再インデントしない)
    await alice.page.goto(`/articles/${article.id}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    const bobReplyRow = alice.page
      .locator('.comment-replies .comment-row')
      .filter({ hasText: 'こちらこそ' })
      .first();
    await bobReplyRow.getByRole('button', { name: /返信/ }).click();
    await alice.page.waitForTimeout(300);
    const nestedComposer = alice.page.locator('.comment-replies .comment-composer').first();
    await nestedComposer.locator('textarea').fill('もちろんです！どんなことですか？');
    await nestedComposer.getByRole('button', { name: '投稿する' }).click();
    await alice.page.waitForTimeout(800);
    await shot(alice.page, 'alice-nested-reply-flat');

    // 孫コメントが「子と同列」(=同じ .comment-replies の中) に入っている事を確認
    const repliesA = alice.page.locator('.comment-replies').first();
    await expect(repliesA).toContainText('もちろんです');
    // .comment-replies の中に .comment-replies (孫) がネストしていない事
    expect(await repliesA.locator('.comment-replies').count()).toBe(0);

    // ---------- 編集 ----------
    // alice 自身のコメントを編集 (✎ アイコン)
    // (icon-only button + title 属性は role 名検索が不安定なので class で取る)
    const aliceTopRow = alice.page
      .locator('.comment-tree > li > .comment-row')
      .filter({ hasText: 'ありがとうございます' })
      .first();
    await expect(aliceTopRow).toBeVisible({ timeout: 5000 });
    // 編集ボタン (.icon-btn の最初、削除は .icon-btn-danger)
    await aliceTopRow.locator('.comment-row-actions .icon-btn').first().click();
    await alice.page.waitForTimeout(200);
    const editTextarea = aliceTopRow.locator('.comment-edit textarea');
    await editTextarea.fill('ありがとうございます！(編集後)\n\n本当に嬉しいです。');
    await shot(alice.page, 'alice-editing');
    await aliceTopRow.getByRole('button', { name: '保存' }).click();
    await alice.page.waitForTimeout(600);
    await shot(alice.page, 'alice-edited');
    await expect(aliceTopRow).toContainText('編集後');
    await expect(aliceTopRow).toContainText('(編集済)');

    // ---------- 削除 ----------
    alice.page.on('dialog', (d) => d.accept());
    await aliceTopRow.locator('.icon-btn-danger').click();
    await alice.page.waitForTimeout(600);
    await shot(alice.page, 'alice-deleted');
    // 編集後の文言がもう表示されていない
    await expect(alice.page.locator('body')).not.toContainText('編集後');

    // ---------- post (SNS 投稿) 側 ----------
    // alice が community を作って post を投稿、bob を招待してコメント
    const cr = await alice.page.request.post('/api/communities', {
      data: { name: 'cmt-club-' + Date.now(), description: '', visibility: 'private' },
    });
    const com = await cr.json();
    const inv = await alice.page.request.post(`/api/communities/${com.id}/invites`, {
      data: { email: bob.email },
    });
    const invJ = await inv.json();
    await bob.page.goto(`/invite/${invJ.token}`);
    await bob.page.waitForURL(new RegExp(`/communities/${com.id}$`), { timeout: 10_000 });

    // alice が post 投稿
    await alice.page.goto(`/communities/${com.id}`);
    await alice.page.waitForLoadState('networkidle').catch(() => {});
    await alice.page.locator('.post-composer textarea').fill('SNS 投稿にもコメント付くよ');
    await alice.page.locator('.post-composer').getByRole('button', { name: '投稿する' }).click();
    await alice.page.waitForTimeout(800);

    // bob 視点で post の 💬 を押してコメント開く → コメント
    await bob.page.goto(`/communities/${com.id}`);
    await bob.page.waitForLoadState('networkidle').catch(() => {});
    const postCard = bob.page.locator('.post-card').filter({ hasText: 'SNS 投稿にもコメント付くよ' }).first();
    // 「💬 0」ボタンを押して comment section を開く
    await postCard.locator('.post-action', { hasText: '💬' }).click();
    await bob.page.waitForTimeout(400);
    await shot(bob.page, 'bob-post-comments-opened');
    // post 内の composer に書く
    await postCard.locator('.comment-composer textarea').fill('SNS のコメントも markdown OK?\n\n`code` テスト');
    await postCard.locator('.comment-composer').getByRole('button', { name: '投稿する' }).click();
    await bob.page.waitForTimeout(800);
    await shot(bob.page, 'bob-post-commented');
    await expect(postCard.locator('.comment-row .comment-body code').first()).toContainText('code');

    console.log('SHOTS:', fs.readdirSync(SHOTS_DIR).sort().join('\n'));
    await aCtx.close();
    await bCtx.close();
  });
});
