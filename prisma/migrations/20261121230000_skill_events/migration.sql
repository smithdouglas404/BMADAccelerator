-- Real skill usage: loaded into an agent, used in a turn, opened on the Skills page (Doug, Nov 21).
CREATE TABLE "SkillEvent" (
    "id" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "agent" TEXT NOT NULL DEFAULT '',
    "useCaseId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SkillEvent_skill_createdAt_idx" ON "SkillEvent"("skill", "createdAt");
CREATE INDEX "SkillEvent_kind_createdAt_idx" ON "SkillEvent"("kind", "createdAt");
