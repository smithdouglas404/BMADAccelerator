-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "author" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "authorRole" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "addressed" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "raw" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ref" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Product owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
