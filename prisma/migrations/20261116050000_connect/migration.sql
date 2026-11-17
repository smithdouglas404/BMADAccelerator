-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read',
    "customer" TEXT NOT NULL DEFAULT '',
    "person" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'Product owner',
    "clientId" TEXT NOT NULL DEFAULT '',
    "refreshHash" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiToken_hash_key" ON "ApiToken"("hash");
CREATE INDEX "ApiToken_refreshHash_idx" ON "ApiToken"("refreshHash");

CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "redirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

CREATE TABLE "OAuthCode" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "customer" TEXT NOT NULL DEFAULT '',
    "person" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'Product owner',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthCode_hash_key" ON "OAuthCode"("hash");

CREATE TABLE "ConnectorCall" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "person" TEXT NOT NULL DEFAULT '',
    "tool" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL DEFAULT '',
    "via" TEXT NOT NULL DEFAULT 'mcp',
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConnectorCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConnectorCall_createdAt_idx" ON "ConnectorCall"("createdAt");
