-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'upload',
ADD COLUMN     "textPath" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."Ticket" ADD COLUMN     "bmadStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trackerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trackerUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."UseCase" ADD COLUMN     "agentBusy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agentError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "agentStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bmadVersion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "generateBusy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "generateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "generateSessionId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "generateStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "initiative" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "previewPort" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provisioned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "ticketRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentEvent" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomSkill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "report" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomSkill_name_key" ON "public"."CustomSkill"("name");

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentEvent" ADD CONSTRAINT "AgentEvent_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
