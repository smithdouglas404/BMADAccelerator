-- When each Board card was made, so the Board can list newest first (Doug, Nov 21).
ALTER TABLE "Move" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Existing cards: the time their "added" record says, else their first record, else when they last changed.
UPDATE "Move" m SET "createdAt" = COALESCE(
  (SELECT min(t."createdAt") FROM "TruthChange" t WHERE t."useCaseId" = m."useCaseId" AND t.node = 'move:' || m.id),
  m."updatedAt"
);
