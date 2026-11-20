
-- CreateTable
CREATE TABLE "WorkerJob" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("name")
);

