-- AlterTable
ALTER TABLE "public"."UseCase" ADD COLUMN     "agentSecret" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "agentToken" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "public"."AppAgent" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "persona" BOOLEAN NOT NULL DEFAULT true,
    "personaText" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT '',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "approvals" JSONB NOT NULL DEFAULT '{}',
    "facts" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "decisionId" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppAgent_useCaseId_key_key" ON "public"."AppAgent"("useCaseId", "key");

-- AddForeignKey
ALTER TABLE "public"."AppAgent" ADD CONSTRAINT "AppAgent_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

