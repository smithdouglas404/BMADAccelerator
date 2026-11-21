-- Each specialist's question areas and how far the people on the product have answered them (Doug, Nov 21).
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "specialist" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Coverage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coverage_useCaseId_specialist_area_key" ON "Coverage"("useCaseId", "specialist", "area");
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "UseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
