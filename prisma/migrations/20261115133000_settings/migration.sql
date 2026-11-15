CREATE TABLE "StoredKey" (
    "name" TEXT NOT NULL,
    "cipher" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoredKey_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "ModelChoice" (
    "role" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelChoice_pkey" PRIMARY KEY ("role")
);
