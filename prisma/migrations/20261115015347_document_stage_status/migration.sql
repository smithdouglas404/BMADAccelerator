-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "declineNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'in_review';
UPDATE "Document" SET "status" = 'approved' WHERE "approved" = true;
