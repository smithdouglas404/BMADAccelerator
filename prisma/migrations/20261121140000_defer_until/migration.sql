-- A deferred backlog item comes back (needs a person again) on this day.
ALTER TABLE "BacklogItem" ADD COLUMN "deferUntil" TIMESTAMP(3);
