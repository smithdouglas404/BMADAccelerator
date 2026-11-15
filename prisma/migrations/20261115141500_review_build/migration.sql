-- The review queue feeds Generate: each decision can be ticked into the next build.
ALTER TABLE "ReviewItem" ADD COLUMN "includeInBuild" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReviewItem" ADD COLUMN "builtInVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReviewItem" ADD COLUMN "refinedAt" TIMESTAMP(3);
ALTER TABLE "ReviewItem" ADD COLUMN "previousAnswer" TEXT NOT NULL DEFAULT '';

-- Decisions the client already made go into builds by default.
UPDATE "ReviewItem" SET "includeInBuild" = true
WHERE "status" IN ('approved', 'answered', 'edited') AND "kind" NOT IN ('move', 'document');

-- Those made before the latest build count as built into it.
UPDATE "ReviewItem" r SET "builtInVersion" = u."generateCount"
FROM "UseCase" u
WHERE r."useCaseId" = u."id" AND u."lastGeneratedAt" IS NOT NULL AND r."resolvedAt" IS NOT NULL AND r."resolvedAt" <= u."lastGeneratedAt";
