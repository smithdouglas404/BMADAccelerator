-- Every model call the Studio makes is recorded, not only Claude Code runs (Doug, Nov 22): who made it, which model,
-- tokens, whether the cost was reported or estimated, whether it failed, which attempt it was, and what the turn answered.
ALTER TABLE "LlmUsage" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE "LlmUsage" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LlmUsage" ADD COLUMN "costSource" TEXT NOT NULL DEFAULT 'reported';
ALTER TABLE "LlmUsage" ADD COLUMN "ok" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LlmUsage" ADD COLUMN "error" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LlmUsage" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LlmUsage" ADD COLUMN "causes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LlmUsage" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "LlmUsage_externalId_key" ON "LlmUsage"("externalId");
CREATE INDEX "LlmUsage_turnId_idx" ON "LlmUsage"("turnId");
ALTER TABLE "LlmUsage" ADD COLUMN "extSeq" INTEGER NOT NULL DEFAULT 0;
