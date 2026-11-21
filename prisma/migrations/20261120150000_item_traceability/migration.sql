-- Each message can say which backlog items and Board cards it is about, and which Socra turn wrote it.
ALTER TABLE "Message" ADD COLUMN "about" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Message" ADD COLUMN "turnId" TEXT NOT NULL DEFAULT '';

-- One Socra turn as it really ran: its causes, the core skills loaded, and the skills, specialists and tools it used.
CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "causes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "loaded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentTurn_useCaseId_startedAt_idx" ON "AgentTurn"("useCaseId", "startedAt");
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
