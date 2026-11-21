-- Settings > Agent memory: the plain-language narrative of an agent's memory, with the records it cites (Doug, Nov 21).
CREATE TABLE "MemoryNarrative" (
    "id" TEXT NOT NULL,
    "agentRef" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "sentences" JSONB NOT NULL DEFAULT '[]',
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "records" JSONB NOT NULL DEFAULT '[]',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "auth" TEXT NOT NULL DEFAULT '',
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "by" TEXT NOT NULL DEFAULT '',
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryNarrative_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryNarrative_agentRef_scope_createdAt_idx" ON "MemoryNarrative"("agentRef", "scope", "createdAt");
