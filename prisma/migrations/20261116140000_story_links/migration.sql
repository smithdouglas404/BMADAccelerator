CREATE TABLE "StoryLink" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "why" TEXT NOT NULL DEFAULT '',
    "by" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoryLink_useCaseId_from_to_kind_key" ON "StoryLink"("useCaseId", "from", "to", "kind");
ALTER TABLE "StoryLink" ADD CONSTRAINT "StoryLink_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
