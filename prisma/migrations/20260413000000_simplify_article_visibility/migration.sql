-- 記事の公開範囲を「全体公開 / 友達のみ」にシンプル化
-- 旧 affiliation_in / affiliation_out を public に変換
UPDATE "Article" SET "visibility" = 'public' WHERE "visibility" IN ('affiliation_in', 'affiliation_out');
