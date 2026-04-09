import { test, expect } from '@playwright/test';
import { createArticleViaApi, registerAndLogin } from './helpers';

// 整列済み AA (ASCII のみ, 全行 22 列)。
// CJK / 罫線文字を混ぜると per-glyph フォールバックで列ズレが起きる
// ホスト依存問題を踏むので、テストは ASCII-only で「最低限の等幅性」を担保する。
const AA = `\`\`\`
+------+      +------+
| Foo  |----->| Bar  |
| 1234 |      | 5678 |
+------+      +------+
\`\`\``;

test('コードフェンス内のAA図が忠実に保存・描画される', async ({ page }) => {
  await registerAndLogin(page, 'aa');
  const a = await createArticleViaApi(page, {
    title: 'AAフローチャートのテスト',
    body: '# 図\n\n以下の図を見てください。\n\n' + AA + '\n\n以上です。',
    topicNames: ['aa'],
  });

  await page.goto(`/articles/${a.id}`);

  // pre 要素が1つ以上ある
  const pre = page.locator('article .md pre').first();
  await expect(pre).toBeVisible();

  // 文字が rendered text に含まれていること
  const text = await pre.textContent();
  expect(text).toContain('+------+      +------+');
  expect(text).toContain('| Foo  |----->| Bar  |');
  expect(text).toContain('| 1234 |      | 5678 |');

  // 行ごとに横位置 (左罫線 │ の x座標) を測って、上下で揃っていることを検証
  // 同じ列に並んでいるはずの │ がフォント幅崩れで何 px ずれるかを許容しきい値で確認
  const rect = await pre.boundingBox();
  expect(rect).toBeTruthy();

  // 各 │ の左端 X 座標を全部取って、それが何種類に分類されるかを見る
  // (同じ列の │ は同じ X になるはず → 列数くらいに収束する)
  // フォント幅が日本語と罫線で違うと、行ごとに微妙にずれて散らばる
  const xs: number[] = await pre.evaluate((el) => {
    const result: number[] = [];
    const range = document.createRange();
    // pre 配下の全 TextNode を走査して "|" の x 座標を取る
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const tn = node as Text;
      const text = tn.data;
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== '|') continue;
        try {
          range.setStart(tn, i);
          range.setEnd(tn, i + 1);
          const r = range.getBoundingClientRect();
          result.push(Math.round(r.left));
        } catch { /* ignore */ }
      }
    }
    return result;
  });
  console.log('| X座標サンプル:', xs.slice(0, 20), '...total', xs.length);
  // 2行 × 4 pipes = 8 個
  expect(xs.length).toBe(8);

  // デバッグ用
  const debugFont = await pre.evaluate((el) => getComputedStyle(el).fontFamily);
  console.log('適用フォント:', debugFont);

  // 4 列の縦罫線。同じ列の "|" は同じ X に来るはず → ユニーク値は最大 4
  const buckets = new Set(xs.map((x) => Math.round(x / 2)));
  console.log('列数 (2px丸め):', buckets.size);
  expect(buckets.size).toBeLessThanOrEqual(4);

  // 計算されたフォントを取り出し (CJK monospace が当たっていること)
  const fontFamily = await pre.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily.toLowerCase()).toMatch(/(gothic|mono|cascadia|consolas|sarasa|noto|han code)/);
  // line-height は 1.5em ~ 1.6em 程度 (本文の 1.7 より引き締まっていること)
  const lineHeight = await pre.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const fontSize = await pre.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(lineHeight / fontSize).toBeLessThanOrEqual(1.6);

  // スクリーンショット (人間が後で目視確認できるよう保存)
  await pre.screenshot({ path: 'test-results/aa-rendering.png' });
});
