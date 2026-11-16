-- Archived use cases leave the home list but keep everything.
ALTER TABLE "UseCase" ADD COLUMN "archivedAt" TIMESTAMP(3);
