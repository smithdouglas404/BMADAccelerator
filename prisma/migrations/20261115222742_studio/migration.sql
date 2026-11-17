/*
  Warnings:

  - You are about to drop the column `bmadType` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `routing` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `stage` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `becameRef` on the `Feedback` table. All the data in the column will be lost.
  - You are about to drop the column `changesRef` on the `Feedback` table. All the data in the column will be lost.
  - You are about to drop the column `ticketRef` on the `Feedback` table. All the data in the column will be lost.
  - You are about to drop the column `bmadVersion` on the `Preferences` table. All the data in the column will be lost.
  - You are about to drop the column `tracker` on the `Preferences` table. All the data in the column will be lost.
  - You are about to drop the column `trackerProjectKey` on the `Preferences` table. All the data in the column will be lost.
  - You are about to drop the column `activeAgent` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `archMode` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `bmadVersion` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `clientVendor` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `customer` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `ideaStage` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `initiative` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `inspiration` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `intentDone` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `intentKeep` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `intentOutScope` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `needsApprovals` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `onboardingStep` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `pendingQuestion` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `problem` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `regulated` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `size` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `stage` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the column `uxMode` on the `UseCase` table. All the data in the column will be lost.
  - You are about to drop the `Question` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReviewItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Ticket` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Question" DROP CONSTRAINT "Question_useCaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ReviewItem" DROP CONSTRAINT "ReviewItem_useCaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Ticket" DROP CONSTRAINT "Ticket_useCaseId_fkey";

-- AlterTable
ALTER TABLE "public"."Document" DROP COLUMN "bmadType",
DROP COLUMN "routing",
DROP COLUMN "stage",
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "public"."Feedback" DROP COLUMN "becameRef",
DROP COLUMN "changesRef",
DROP COLUMN "ticketRef",
ADD COLUMN     "shape" TEXT NOT NULL DEFAULT 'object',
ADD COLUMN     "target" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."Preferences" DROP COLUMN "bmadVersion",
DROP COLUMN "tracker",
DROP COLUMN "trackerProjectKey";

-- AlterTable
ALTER TABLE "public"."UseCase" DROP COLUMN "activeAgent",
DROP COLUMN "archMode",
DROP COLUMN "bmadVersion",
DROP COLUMN "clientVendor",
DROP COLUMN "customer",
DROP COLUMN "ideaStage",
DROP COLUMN "initiative",
DROP COLUMN "inspiration",
DROP COLUMN "intentDone",
DROP COLUMN "intentKeep",
DROP COLUMN "intentOutScope",
DROP COLUMN "needsApprovals",
DROP COLUMN "onboardingStep",
DROP COLUMN "pendingQuestion",
DROP COLUMN "problem",
DROP COLUMN "regulated",
DROP COLUMN "size",
DROP COLUMN "stage",
DROP COLUMN "uxMode",
ADD COLUMN     "audience" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "components" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "customerQuote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "floorSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "focus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gitBranch" TEXT NOT NULL DEFAULT 'studio',
ADD COLUMN     "gitPushedAt" TIMESTAMP(3),
ADD COLUMN     "gitStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lens" TEXT NOT NULL DEFAULT 'owner',
ADD COLUMN     "linearStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "linearSyncedAt" TIMESTAMP(3),
ADD COLUMN     "linearTeam" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "packageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prfaq" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "prfaqUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "session" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "stageLabel" TEXT NOT NULL DEFAULT 'Discovery → pilot',
ADD COLUMN     "started" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statement" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "techNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "validatedUseCase" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "validation" JSONB NOT NULL DEFAULT '{}';

-- DropTable
DROP TABLE "public"."Question";

-- DropTable
DROP TABLE "public"."ReviewItem";

-- DropTable
DROP TABLE "public"."Ticket";

-- CreateTable
CREATE TABLE "public"."Capability" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kicker" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "readiness" INTEGER NOT NULL DEFAULT 0,
    "delta" TEXT NOT NULL DEFAULT '',
    "signal" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Decision" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "capability" TEXT NOT NULL DEFAULT '',
    "words" TEXT NOT NULL DEFAULT '',
    "agent" TEXT NOT NULL DEFAULT 'Muse',
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer" TEXT NOT NULL DEFAULT '',
    "session" INTEGER NOT NULL DEFAULT 1,
    "includeInBuild" BOOLEAN NOT NULL DEFAULT true,
    "builtInVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklogItem" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'capture',
    "group" TEXT NOT NULL DEFAULT 'Unsorted signal',
    "source" TEXT NOT NULL DEFAULT 'Working session',
    "recKind" TEXT NOT NULL DEFAULT '',
    "probe" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'held',
    "hidden" TEXT NOT NULL DEFAULT '',
    "includeInBuild" BOOLEAN NOT NULL DEFAULT false,
    "builtInVersion" INTEGER NOT NULL DEFAULT 0,
    "annotationId" TEXT NOT NULL DEFAULT '',
    "trackerId" TEXT NOT NULL DEFAULT '',
    "trackerUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Evidence" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'conversation',
    "insight" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "trace" TEXT NOT NULL DEFAULT '',
    "documentId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Move" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "capability" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "owner" TEXT NOT NULL DEFAULT 'Product Engineer',
    "signal" TEXT NOT NULL DEFAULT '',
    "hidden" TEXT NOT NULL DEFAULT 'story',
    "components" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "routes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prompt" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "trackerId" TEXT NOT NULL DEFAULT '',
    "trackerUrl" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentRoute" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "detail" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."McpServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "transport" TEXT NOT NULL DEFAULT 'http',
    "url" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "args" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secretCipher" TEXT NOT NULL DEFAULT '',
    "secretNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allProducts" BOOLEAN NOT NULL DEFAULT true,
    "useCases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Capability_useCaseId_key_key" ON "public"."Capability"("useCaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRoute_useCaseId_agent_key" ON "public"."AgentRoute"("useCaseId", "agent");

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_name_key" ON "public"."McpServer"("name");

-- AddForeignKey
ALTER TABLE "public"."Capability" ADD CONSTRAINT "Capability_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Decision" ADD CONSTRAINT "Decision_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklogItem" ADD CONSTRAINT "BacklogItem_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Evidence" ADD CONSTRAINT "Evidence_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Move" ADD CONSTRAINT "Move_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentRoute" ADD CONSTRAINT "AgentRoute_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The Studio replaces BMAD: earlier conversations carry over in the Muse's voice, and every
-- earlier use case is opened afresh by the Muse (new session, Studio skills, PRFAQ and capabilities).
UPDATE "public"."Message" SET "role" = 'muse', "agent" = 'Muse' WHERE "role" = 'concierge';
UPDATE "public"."Message" SET "role" = 'agent' WHERE "role" = 'bmad-agent';
UPDATE "public"."Message" SET "role" = 'signal', "agent" = 'Note' WHERE "role" = 'system';
UPDATE "public"."UseCase" SET "claudeSessionId" = '', "generateSessionId" = '', "provisioned" = false, "started" = false;
DELETE FROM "public"."AgentEvent" WHERE "status" IN ('queued', 'running', 'failed');
