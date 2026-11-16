-- Product Truth Graph: the change timeline, annotation interpretations, and the cause of each Muse turn.
ALTER TABLE "Feedback" ADD COLUMN "interpretation" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "AgentEvent" ADD COLUMN "cause" TEXT NOT NULL DEFAULT '';
CREATE TABLE "TruthChange" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" TEXT NOT NULL DEFAULT '',
    "after" TEXT NOT NULL DEFAULT '',
    "causes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "by" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruthChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TruthChange_useCaseId_createdAt_idx" ON "TruthChange"("useCaseId", "createdAt");
ALTER TABLE "TruthChange" ADD CONSTRAINT "TruthChange_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
