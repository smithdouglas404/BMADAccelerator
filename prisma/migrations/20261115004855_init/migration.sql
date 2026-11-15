-- CreateTable
CREATE TABLE "public"."UseCase" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "intentDone" TEXT NOT NULL DEFAULT '',
    "intentKeep" TEXT NOT NULL DEFAULT '',
    "intentOutScope" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "problem" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT 'project',
    "needsApprovals" BOOLEAN NOT NULL DEFAULT false,
    "clientVendor" BOOLEAN NOT NULL DEFAULT false,
    "regulated" BOOLEAN NOT NULL DEFAULT false,
    "ideaStage" TEXT NOT NULL DEFAULT 'new',
    "repoUrl" TEXT NOT NULL DEFAULT '',
    "uxMode" TEXT NOT NULL DEFAULT 'coaching',
    "archMode" TEXT NOT NULL DEFAULT 'coaching',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'clarify',
    "activeAgent" TEXT NOT NULL DEFAULT 'concierge',
    "pendingQuestion" TEXT NOT NULL DEFAULT '',
    "claudeSessionId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UseCaseSkill" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "UseCaseSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "bmadType" TEXT NOT NULL DEFAULT 'other',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agent" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ticket" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "epicRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "refined" BOOLEAN NOT NULL DEFAULT true,
    "after" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unknown" TEXT NOT NULL DEFAULT '',
    "verify" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "trackerStatus" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewItem" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'concierge',
    "targetId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "answer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recording" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'describe',
    "transcript" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Preferences" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "targetCodex" BOOLEAN NOT NULL DEFAULT false,
    "targetCursor" BOOLEAN NOT NULL DEFAULT false,
    "targetAntigravity" BOOLEAN NOT NULL DEFAULT false,
    "tracker" TEXT NOT NULL DEFAULT 'builtin',
    "trackerProjectKey" TEXT NOT NULL DEFAULT '',
    "bmadVersion" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UseCase_slug_key" ON "public"."UseCase"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UseCaseSkill_useCaseId_skillId_key" ON "public"."UseCaseSkill"("useCaseId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_useCaseId_ref_key" ON "public"."Ticket"("useCaseId", "ref");

-- AddForeignKey
ALTER TABLE "public"."UseCaseSkill" ADD CONSTRAINT "UseCaseSkill_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewItem" ADD CONSTRAINT "ReviewItem_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "public"."UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
