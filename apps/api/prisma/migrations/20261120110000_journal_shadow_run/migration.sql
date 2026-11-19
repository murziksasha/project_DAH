-- Roadmap «Journal as SoT»: daily shadow-compare results (additive, safe for existing data).
-- CreateTable
CREATE TABLE "JournalShadowRun" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "readyForSot" BOOLEAN NOT NULL,
    "reconcileOk" BOOLEAN NOT NULL,
    "advancesOk" BOOLEAN NOT NULL,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalShadowRun_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "JournalShadowRun_buildingId_day_key" ON "JournalShadowRun"("buildingId", "day");
-- AddForeignKey
ALTER TABLE "JournalShadowRun" ADD CONSTRAINT "JournalShadowRun_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
