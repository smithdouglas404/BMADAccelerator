CREATE TABLE "NotifyTarget" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotifyTarget_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotifySent" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotifySent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotifySent_targetId_key_key" ON "NotifySent"("targetId", "key");
