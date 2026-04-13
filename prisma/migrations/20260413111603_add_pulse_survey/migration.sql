-- CreateTable
CREATE TABLE "PulseSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opensAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PulseSurvey_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PulseSurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PulseSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "PulseSurvey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PulseSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PulseSurvey_communityId_status_idx" ON "PulseSurvey"("communityId", "status");

-- CreateIndex
CREATE INDEX "PulseSurvey_closesAt_idx" ON "PulseSurvey"("closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "PulseSurvey_communityId_periodLabel_key" ON "PulseSurvey"("communityId", "periodLabel");

-- CreateIndex
CREATE INDEX "PulseSurveyResponse_surveyId_idx" ON "PulseSurveyResponse"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "PulseSurveyResponse_surveyId_userId_key" ON "PulseSurveyResponse"("surveyId", "userId");
