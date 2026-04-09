-- カテゴリラベル変更: tech → howto, idea → diary
-- (Tech / Idea が Zenn 由来だったので、社内向けに howto / diary に置き換え)
UPDATE "Article" SET "type" = 'howto' WHERE "type" = 'tech';
UPDATE "Article" SET "type" = 'diary' WHERE "type" = 'idea';
