-- Separate PRD and TRD screens with guided walkthroughs (Doug, Nov 21): where each walkthrough stands.
ALTER TABLE "UseCase" ADD COLUMN "specWalk" JSONB NOT NULL DEFAULT '{}';
