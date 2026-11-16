-- CreateTable
CREATE TABLE "JevCall" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL DEFAULT '',
    "feature" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "input" JSONB NOT NULL DEFAULT '{}',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "jev" TEXT NOT NULL DEFAULT '',
    "old" TEXT NOT NULL DEFAULT '',
    "used" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "ms" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JevCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JevCall_feature_createdAt_idx" ON "JevCall"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "JevCall_ref_idx" ON "JevCall"("ref");
