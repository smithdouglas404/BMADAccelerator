-- Generate PRFAQ from what was said (Doug, Nov 21): where each PRFAQ line came from, the documents picked for
-- it, and earlier versions (so Generate new can be undone); talks keep the words as spoken.
ALTER TABLE "UseCase" ADD COLUMN "prfaqSources" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Recording" ADD COLUMN "raw" TEXT NOT NULL DEFAULT '';
