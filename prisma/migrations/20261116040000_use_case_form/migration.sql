-- AlterTable
ALTER TABLE "public"."UseCase" ADD COLUMN     "businessArea" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastView" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "summary" TEXT NOT NULL DEFAULT '';

