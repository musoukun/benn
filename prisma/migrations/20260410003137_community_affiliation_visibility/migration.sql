-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Community" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "visibilityAffiliationIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Community" ("avatarUrl", "createdAt", "description", "id", "name", "slug", "visibility") SELECT "avatarUrl", "createdAt", "description", "id", "name", "slug", "visibility" FROM "Community";
DROP TABLE "Community";
ALTER TABLE "new_Community" RENAME TO "Community";
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
