-- CreateTable
CREATE TABLE "CommunityLeftLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "leftAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityLeftLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityLeftLog_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommunityLeftLog_userId_idx" ON "CommunityLeftLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityLeftLog_userId_communityId_key" ON "CommunityLeftLog"("userId", "communityId");
