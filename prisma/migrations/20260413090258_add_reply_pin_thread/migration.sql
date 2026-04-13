-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'user',
    "editedAt" DATETIME,
    "parentMessageId" TEXT,
    "pinnedAt" DATETIME,
    "pinnedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "ChatMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("authorId", "body", "createdAt", "editedAt", "id", "roomId", "type", "updatedAt") SELECT "authorId", "body", "createdAt", "editedAt", "id", "roomId", "type", "updatedAt" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");
CREATE INDEX "ChatMessage_authorId_idx" ON "ChatMessage"("authorId");
CREATE INDEX "ChatMessage_parentMessageId_idx" ON "ChatMessage"("parentMessageId");
CREATE INDEX "ChatMessage_roomId_pinnedAt_idx" ON "ChatMessage"("roomId", "pinnedAt");
CREATE TABLE "new_CommunityTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'open',
    "visibilityAffiliationIds" TEXT NOT NULL DEFAULT '',
    "visibilityUserIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityTimeline_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommunityTimeline" ("communityId", "createdAt", "id", "name", "visibility", "visibilityAffiliationIds", "visibilityUserIds") SELECT "communityId", "createdAt", "id", "name", "visibility", "visibilityAffiliationIds", "visibilityUserIds" FROM "CommunityTimeline";
DROP TABLE "CommunityTimeline";
ALTER TABLE "new_CommunityTimeline" RENAME TO "CommunityTimeline";
CREATE INDEX "CommunityTimeline_communityId_idx" ON "CommunityTimeline"("communityId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
