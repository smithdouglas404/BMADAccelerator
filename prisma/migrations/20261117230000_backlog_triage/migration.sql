-- Whether a person has dealt with a new backlog item on the Board: "" = needs you (red marker),
-- "working" = being worked on with Socra, "accepted" = on the Board as a card, "rejected" = set aside.
ALTER TABLE "BacklogItem" ADD COLUMN "triage" TEXT NOT NULL DEFAULT '';
-- Items that were already built, parked or withdrawn before this change need nobody.
UPDATE "BacklogItem" SET "triage" = 'accepted' WHERE "state" = 'built' OR "kind" = 'distraction';
