-- What each Claude run cost (Doug, Nov 22): one row per run, taken from the numbers Claude Code itself reports.
-- The cum* columns hold the running totals of the session so a resumed session is counted once, not again.
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'turn',
    "model" TEXT NOT NULL DEFAULT '',
    "auth" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumInput" INTEGER NOT NULL DEFAULT 0,
    "cumOutput" INTEGER NOT NULL DEFAULT 0,
    "cumCache" INTEGER NOT NULL DEFAULT 0,
    "baseline" BOOLEAN NOT NULL DEFAULT false,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LlmUsage_useCaseId_at_idx" ON "LlmUsage"("useCaseId", "at");
CREATE INDEX "LlmUsage_sessionId_idx" ON "LlmUsage"("sessionId");
