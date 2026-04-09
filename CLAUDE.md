# CLAUDE.md (uchi)

This file provides guidance to Claude Code when working in the **uchi** project.

## プロジェクト概要

**Uchi (うち)** — 身内向けの Markdown 記事投稿 SNS。
旧称は Benn (便所の落書き由来) だったが、ユーモアと内輪感を両立する `Uchi (内/家)` に改名。

- 独立 git リポジトリ: `https://github.com/musoukun/uchi`
- ローカル: `D:\develop\sns\uchi\`
- 旧 GAS 版 (`../gas/`) は廃止扱い、触らない

## 技術スタック

- フロント: React 18 + React Router 7 + Vite 6
- バックエンド: Hono (Node アダプタ) on the same Vite dev server
- DB: SQLite + Prisma 5
- 認証: メール+パスワード, Copenhagen Book 準拠セッション (cookie 名 `uchi_session`)
- AI: OpenAI / Anthropic / Gemini に対応 (per-user 設定, AES-256-GCM 暗号化、env `UCHI_SECRET_KEY`)
- E2E: Playwright (`tests/e2e/`)

## 主要パス

- `src/server/` — Hono routes
  - `routes.ts` — articles / users / topics / likes / bookmarks / follows / trending
  - `routes-affiliations.ts` — 所属タグ
  - `routes-communities.ts` — コミュニティ + メンバー + 招待 + タイムライン + 承認
  - `routes-ai.ts` — AIプロバイダ設定 + プロンプト + レビュー + 要約
  - `routes-aggregation.ts` — 集約テンプレート + Markdown 生成
  - `scheduler.ts` — 予約公開ワーカー (60秒間隔)
  - `ai.ts` — LLM 抽象化 (OpenAI/Anthropic/Gemini)
  - `crypto.ts` — APIキー AES-256-GCM
- `src/client/` — React SPA
  - `pages/HomePage.tsx` `ArticlePage.tsx` `EditorPage.tsx`
  - `pages/CommunitiesPage.tsx` `CommunityPage.tsx`
  - `pages/AccountSettingsPage.tsx` (所属/AIプロバイダ/プロンプト)
  - `pages/SummarizePage.tsx` `AggregatePage.tsx`
  - `pages/InvitePage.tsx`
- `prisma/schema.prisma` — DB スキーマ
- `tests/e2e/` — Playwright 仕様
- `doc/plan.md` — 機能追加計画 (進捗管理)

## 開発コマンド

```powershell
cd D:\develop\sns\uchi
npm run dev                          # vite + hono dev server (http://localhost:5173)
npm run db:generate                  # prisma client 再生成
npm run db:migrate                   # マイグレーション作成 + 適用
npm run test:e2e                     # Playwright E2E (要 dev サーバー or 自動起動)
$env:E2E_GEMINI_KEY="..."; npm run test:e2e   # AI機能含む全テスト
```

## 環境変数 (`.env`)

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | SQLite ファイル (`file:./dev.db`) |
| `UCHI_SECRET_KEY` | AI APIキー暗号化用 32byte hex |
| `KOKO_PRO_TOKEN` | KokonutUI Pro 認証 (任意) |

## AI モデルポリシー (固定)

モデル切替 UI は出さない。各社1モデル固定:

| Provider | Model |
|---|---|
| Gemini | `gemini-2.5-flash` |
| OpenAI | `gpt-5-mini` |
| Anthropic | `claude-sonnet-4-6` |

ユーザーは `/me/settings` の AIプロバイダタブで複数登録 + デフォルト切替できる。
レビュー結果は `ArticleReview` テーブルに JSON で保存し、`/articles/:id` の「🤖 AIレビュー」ボタンから実行/再表示。

## 開発方針

- YAGNI / DRY / KISS。1ファイル 1000行を超えそうなら分割
- 新しい list 系 API は visibility (`filterByVisibility`) を通すこと
- 新しい write 関数を追加したらモデル整合性 (community 承認、scheduledAt 等) を意識する
- フロント側の localStorage / sessionStorage キーは `uchi:*` プレフィックス
- E2E は API 直叩き派 + UI 経由派を併用 (CSRF回避のため body 無し POST には `{ data: {} }` を渡す)

## 既知の注意点

- **AA 図** (┌─┐│└┘) は `.md pre` の CJK 等幅フォントスタックで対応。ただし per-glyph フォントフォールバックの都合で CJK + box-drawing 混在のソースは「秩序ある (=列幅が揃った) AA」前提。E2E は ASCII-only AA で最低限の等幅性を担保
- **Vite dev server 起動中** だと Prisma client 再生成 (`prisma generate`) が file lock で失敗する。dev server を一度止めてから打つ
- **Hono CSRF middleware** は body 無しの POST で Origin 検査に引っかかることがある。Playwright `page.request.post` で body 無しの呼び出しは `{ data: {} }` を渡す
- **markdown-it の `<?` 文字** は historically GAS HtmlService と衝突したが現行構成では関係ない。気にしなくて良い

## デプロイ (Docker)

```bash
docker compose up -d
```

`uchi` サービスが `http://localhost:3000` で起動し、SQLite ファイルは Docker ボリューム `uchi-data` に永続化される。
