-- The Studio's link to a self-hosted Nasiko (Doug, Nov 21). One row; the password is stored encrypted.
CREATE TABLE "NasikoLink" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "url" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "cipher" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "loggedInAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NasikoLink_pkey" PRIMARY KEY ("id")
);
