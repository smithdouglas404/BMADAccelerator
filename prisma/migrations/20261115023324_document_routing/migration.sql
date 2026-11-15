-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "routing" JSONB NOT NULL DEFAULT '[]';
