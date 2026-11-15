-- CreateTable
CREATE TABLE "public"."SpecSection" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "kicker" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'open',
    "basis" TEXT NOT NULL DEFAULT 'not-researched',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "review" TEXT NOT NULL DEFAULT '',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "capability" TEXT NOT NULL DEFAULT '',
    "related" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trace" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpecRevision" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL DEFAULT '[]',
    "diff" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecSection_useCaseId_key_key" ON "public"."SpecSection"("useCaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SpecRevision_useCaseId_version_key" ON "public"."SpecRevision"("useCaseId", "version");

-- AddForeignKey
ALTER TABLE "public"."SpecSection" ADD CONSTRAINT "SpecSection_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpecRevision" ADD CONSTRAINT "SpecRevision_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
