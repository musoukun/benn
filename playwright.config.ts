import { defineConfig, devices } from '@playwright/test';

// 方針:
// - すでに `npm run dev` が走っていればそれを使い回す
// - 走っていなければ webServer で起動する
// - DBは dev.db を共用 (テストは uniq なメールでアカウント作成するので衝突しない)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // テスト失敗時のスクショ・トレースは screenshots/ 配下に保存
  outputDir: './screenshots/test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
