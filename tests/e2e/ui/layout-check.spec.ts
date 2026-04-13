import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOTS_DIR = path.join(process.cwd(), 'screenshots', 'layout');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function reg(page: Page, prefix: string) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  await page.goto('/register');
  await page.locator('input[type="text"]').first().fill(`${prefix}-${stamp}`);
  await page.locator('input[type="email"]').fill(`${prefix}-${stamp}@example.test`);
  await page.locator('input[type="password"]').fill('pwpwpwpw-' + stamp);
  await page.getByRole('button', { name: /登録/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 10_000 });
}

test('layout centering at 2400x1200', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 2400, height: 1200 } });
  const page = await ctx.newPage();
  await reg(page, 'lay');
  await page.goto('/');
  await page.waitForTimeout(400);
  // ヘッダーと container の bbox を測定して中央寄せを検証
  const measure = async (sel: string) => {
    const box = await page.locator(sel).first().boundingBox();
    if (!box) return null;
    const leftMargin = box.x;
    const rightMargin = 2400 - (box.x + box.width);
    return { x: box.x, w: box.width, leftMargin, rightMargin, diff: Math.abs(leftMargin - rightMargin) };
  };
  const header = await measure('.header-inner');
  const container = await measure('.container');
  console.log('header-inner:', header);
  console.log('container:', container);
  // 中央寄せされていれば leftMargin ≈ rightMargin
  if (header && header.diff > 5) throw new Error(`header not centered: L=${header.leftMargin} R=${header.rightMargin}`);
  if (container && container.diff > 5) throw new Error(`container not centered: L=${container.leftMargin} R=${container.rightMargin}`);
  await ctx.close();
});
