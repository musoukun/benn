/*
  Warnings:

  - You are about to drop the column `communityId` on the `PulseSurvey` table. All the data in the column will be lost.
  - Added the required column `affiliationId` to the `PulseSurvey` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PulseSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opensAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PulseSurvey_affiliationId_fkey" FOREIGN KEY ("affiliationId") REFERENCES "Affiliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PulseSurvey" ("closesAt", "createdAt", "createdById", "id", "opensAt", "periodLabel", "status") SELECT "closesAt", "createdAt", "createdById", "id", "opensAt", "periodLabel", "status" FROM "PulseSurvey";
DROP TABLE "PulseSurvey";
ALTER TABLE "new_PulseSurvey" RENAME TO "PulseSurvey";
CREATE INDEX "PulseSurvey_affiliationId_status_idx" ON "PulseSurvey"("affiliationId", "status");
CREATE INDEX "PulseSurvey_closesAt_idx" ON "PulseSurvey"("closesAt");
CREATE UNIQUE INDEX "PulseSurvey_affiliationId_periodLabel_key" ON "PulseSurvey"("affiliationId", "periodLabel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
