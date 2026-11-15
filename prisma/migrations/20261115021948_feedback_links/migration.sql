-- AlterTable
ALTER TABLE "public"."Feedback" ADD COLUMN     "becameRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "changesRef" TEXT NOT NULL DEFAULT '';
