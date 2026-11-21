-- Every read and write of an agent's memory, so Settings > Agent memory can show whether it is used (Doug, Nov 21).
CREATE TABLE "MemoryEvent" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryEvent_role_createdAt_idx" ON "MemoryEvent"("role", "createdAt");
CREATE INDEX "MemoryEvent_kind_createdAt_idx" ON "MemoryEvent"("kind", "createdAt");
