-- AlterTable
ALTER TABLE "public"."Move" ADD COLUMN     "moveReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "movedBy" TEXT NOT NULL DEFAULT '';

