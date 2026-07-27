-- AlterTable Apartment
ALTER TABLE "Apartment" ADD COLUMN "advanceBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable Request
ALTER TABLE "Request" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Request" ADD COLUMN "photoKeys" JSONB NOT NULL DEFAULT '[]';

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('accrual', 'payment', 'expense', 'void_payment', 'void_expense', 'opening');
CREATE TYPE "VoteWeightMode" AS ENUM ('one_per_user', 'one_per_apartment', 'by_area');

-- AlterTable Poll
ALTER TABLE "Poll" ADD COLUMN "voteWeight" "VoteWeightMode" NOT NULL DEFAULT 'one_per_user';
ALTER TABLE "Poll" ADD COLUMN "quorumPercent" DECIMAL(5,2);

-- AlterTable PollVote
ALTER TABLE "PollVote" ADD COLUMN "apartmentId" TEXT;
ALTER TABLE "PollVote" ADD COLUMN "weight" DECIMAL(12,4) NOT NULL DEFAULT 1;

-- CreateTable JournalEntry
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "type" "JournalEntryType" NOT NULL,
    "buildingId" TEXT,
    "apartmentId" TEXT,
    "fundId" TEXT,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "apartmentId" TEXT,
    "fundId" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalEntry_refType_refId_idx" ON "JournalEntry"("refType", "refId");
CREATE INDEX "JournalEntry_type_createdAt_idx" ON "JournalEntry"("type", "createdAt");
CREATE INDEX "JournalEntry_buildingId_createdAt_idx" ON "JournalEntry"("buildingId", "createdAt");
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX "JournalLine_account_apartmentId_idx" ON "JournalLine"("account", "apartmentId");
CREATE INDEX "PollVote_pollId_apartmentId_idx" ON "PollVote"("pollId", "apartmentId");

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
