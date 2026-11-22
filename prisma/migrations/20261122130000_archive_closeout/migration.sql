-- Archived use cases keep a closeout (Doug, Nov 22): the author, and at archive time the production decision,
-- the estimated cost to implement, and the benefits and metrics to track.
ALTER TABLE "UseCase" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UseCase" ADD COLUMN "archivedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UseCase" ADD COLUMN "archiveOutcome" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UseCase" ADD COLUMN "archiveComments" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UseCase" ADD COLUMN "archiveCostEstimate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UseCase" ADD COLUMN "archiveBenefits" TEXT NOT NULL DEFAULT '';
-- The first person added to a use case is its author (the new use case form adds them); older rows get theirs.
UPDATE "UseCase" u SET "createdBy" = COALESCE((SELECT m."name" FROM "Member" m WHERE m."useCaseId" = u."id" ORDER BY m."createdAt" ASC LIMIT 1), '');
