import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin, createArticleViaApi } from './helpers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDecipheriv } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Walkthrough: 主要画面を順にスクショして screenshots/ に出力する。
// AI 機能は Gemini のみ。既存DB上の暗号化済みキーを復号してこのテストの中で
// 新規ユーザーに登録し直す（API キーは平文で受け取る必要があるため）。

const SHOTS_DIR = path.join(process.cwd(), 'screenshots');

function shotPath(name: string) {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  // 連番を付けて時系列に並ぶようにする
  const i = (shotPath as any)._i = ((shotPath as any)._i || 0) + 1;
  const num = String(i).padStart(2, '0');
  return path.join(SHOTS_DIR, `${num}-${name}.png`);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400); // 軽くアニメ落ち着かせ
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

// dev DB から暗号化済み Gemini キーを復号して取り出す
async function loadGeminiKeyAsync(): Promise<string | null> {
  const KEY = Buffer.from(
    process.env.UCHI_SECRET_KEY ||
      '4f6c7a3a8b1d2e9f0a1c2b3d4e5f607182930a1b2c3d4e5f6071829304a5b6c7',
    'hex'
  );
  const p = new PrismaClient();
  try {
    const c = await p.userAIConfig.findFirst({
      where: { provider: 'gemini' },
      orderBy: { createdAt: 'desc' },
    });
    if (!c) return null;
    const [iv, tag, enc] = c.apiKeyEnc.split(':');
    const d = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'hex'));
    d.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(enc, 'hex')), d.final()]).toString('utf8');
  } finally {
    await p.$disconnect();
  }
}

test.describe('Uchi 全体スクショ walkthrough', () => {
  test.setTimeout(240_000);

  test('主要画面を順にスクショ', async ({ page }) => {
    // ---------- 0. 未ログインで /register ----------
    await page.goto('/register');
    await shot(page, 'register-empty');

    // 登録
    const me = await registerAndLogin(page, 'walk');
    await shot(page, 'home-after-register');

    // ---------- 1. AI 設定 (Gemini) ----------
    const geminiKey = await loadGeminiKeyAsync();
    if (geminiKey) {
      const r = await page.request.post('/api/ai/configs', {
        data: {
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          apiKey: geminiKey,
          isDefault: true,
        },
      });
      expect(r.ok(), 'AI config 登録失敗').toBeTruthy();
    }

    // ---------- 2. 所属 (Affiliation) を 1 つ追加 ----------
    await page.goto('/me/settings');
    await shot(page, 'settings-empty');
    // 所属タブはデフォルト表示の想定。フィールドが見えるなら入れる
    const affInput = page.getByPlaceholder(/所属|タグ名|名前/).first();
    if (await affInput.isVisible().catch(() => false)) {
      await affInput.fill('engineering');
      const addBtn = page.getByRole('button', { name: /追加|作成/ }).first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await shot(page, 'settings-after-affiliation');

    // AI プロバイダタブに切り替え (見えれば)
    const aiTab = page.getByRole('button', { name: /AI/ }).first();
    if (await aiTab.isVisible().catch(() => false)) {
      await aiTab.click();
      await shot(page, 'settings-ai-tab');
    }

    // ---------- 3. 記事を 3 本作っておく ----------
    const arts = [];
    for (let i = 1; i <= 3; i++) {
      const a = await createArticleViaApi(page, {
        title: `walkthrough 記事 ${i}`,
        body:
          `# walkthrough 記事 ${i}\n\n` +
          `これは E2E walkthrough のテスト記事です。番号: ${i}\n\n` +
          `## セクション\n\n` +
          `Uchi は身内向けの Markdown SNS です。React + Hono + Prisma + SQLite で動作します。\n\n` +
          `\`\`\`\n┌──────┐\n│ test │\n└──────┘\n\`\`\`\n`,
        topicNames: ['walkthrough'],
      });
      arts.push(a);
    }

    // ---------- 4. Home ----------
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'home');

    // ---------- 5. Trending ----------
    await page.goto('/trending');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'trending');

    // ---------- 6. Following ----------
    await page.goto('/following');
    await shot(page, 'following');

    // ---------- 7. Bookmarks ----------
    await page.goto('/bookmarks');
    await shot(page, 'bookmarks');

    // ---------- 8. 記事詳細 ----------
    await page.goto(`/articles/${arts[0].id}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'article-detail');

    // ---------- 9. AI レビュー (Gemini) ----------
    if (geminiKey) {
      page.on('dialog', (d) => d.accept());
      const reviewBtn = page.getByRole('button', { name: /AIレビュー$/ });
      if (await reviewBtn.isVisible().catch(() => false)) {
        await reviewBtn.click();
        // ヘッダー出現待ち
        try {
          await expect(page.getByRole('heading', { name: 'AIレビュー' })).toBeVisible({
            timeout: 90_000,
          });
        } catch (e) {
          console.log('AIレビュー header not visible:', (e as Error).message);
        }
        await shot(page, 'article-ai-review');
      }
    }

    // ---------- 10. Editor (新規) ----------
    await page.goto('/editor');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'editor-new');

    // 何か入力してプレビュー確認
    const titleInput = page.locator('input[type="text"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill('スクショ用エディタ記事');
    }
    const ta = page.locator('textarea').first();
    if (await ta.isVisible().catch(() => false)) {
      await ta.fill(
        '# 見出し\n\nこれはエディタのプレビュー確認です。\n\n- リスト1\n- リスト2\n\n```\n┌─┐\n│o│\n└─┘\n```\n'
      );
    }
    await shot(page, 'editor-with-content');

    // ---------- 11. My drafts ----------
    await page.goto('/me/drafts');
    await shot(page, 'me-drafts');

    // ---------- 12. Communities 一覧 ----------
    await page.goto('/communities');
    await shot(page, 'communities-list');

    // 作成
    const cname = 'walk-comm-' + Date.now();
    const cnameInput = page.getByPlaceholder('コミュニティ名');
    if (await cnameInput.isVisible().catch(() => false)) {
      await cnameInput.fill(cname);
      const desc = page.getByPlaceholder('説明 (任意)');
      if (await desc.isVisible().catch(() => false)) await desc.fill('walkthrough community');
      await page.getByRole('button', { name: '作成' }).click();
      await page.waitForTimeout(800);
      await shot(page, 'communities-after-create');

      // 詳細
      await page.getByText(cname).first().click();
      await page.waitForTimeout(500);
      await shot(page, 'community-detail');

      // 設定タブ
      const setBtn = page.getByRole('button', { name: '設定' });
      if (await setBtn.isVisible().catch(() => false)) {
        await setBtn.click();
        await shot(page, 'community-settings');
      }
      // 招待タブ
      const invBtn = page.getByRole('button', { name: '招待' });
      if (await invBtn.isVisible().catch(() => false)) {
        await invBtn.click();
        await shot(page, 'community-invite');
      }
    }

    // ---------- 13. Aggregate ----------
    await page.goto('/me/aggregate');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'aggregate');

    // ---------- 14. Summarize ----------
    await page.goto('/me/summarize');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'summarize');

    // 要約 API 直叩き (Gemini)
    if (geminiKey) {
      const r = await page.request.post('/api/ai/summarize', {
        data: { articleIds: [arts[0].id] },
      });
      if (r.ok()) {
        const j = await r.json();
        console.log('SUMMARY:', JSON.stringify(j).slice(0, 400));
      } else {
        console.log('SUMMARY FAILED', r.status(), await r.text());
      }
    }

    // ---------- 15. プロフィール ----------
    // me の userId は getMe API から
    const meRes = await page.request.get('/api/me');
    if (meRes.ok()) {
      const j = await meRes.json();
      if (j?.id) {
        await page.goto(`/users/${j.id}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(page, 'profile');
      }
    }

    console.log('SCREENSHOTS DIR:', SHOTS_DIR);
    const files = fs.readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png')).sort();
    console.log('SHOTS:', files.join('\n'));
  });
});
