-- Phase 0 / Phase 1 (audit 2026-11): tenant scope columns, per-apartment meeting votes,
-- accrual idempotency, journal entry sequence, payment/accrual indexes.

-- ─── Tenant scope: Reminder / BankStatement / ExpenseCategory ────────────────
ALTER TABLE "Reminder" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BankStatement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN "tenantId" TEXT;

-- Backfill reminders: apartment → building tenant, else the creator's only tenant
UPDATE "Reminder" r
SET "tenantId" = b."tenantId"
FROM "Apartment" a
JOIN "Building" b ON b.id = a."buildingId"
WHERE r."apartmentId" = a.id AND r."tenantId" IS NULL;

UPDATE "Reminder" r
SET "tenantId" = m."tenantId"
FROM (
  SELECT "userId", MIN("tenantId") AS "tenantId"
  FROM "TenantMembership"
  GROUP BY "userId"
  HAVING COUNT(DISTINCT "tenantId") = 1
) m
WHERE r."tenantId" IS NULL
  AND m."userId" = COALESCE(r."userId", r."createdById");

-- Backfill bank statements from building
UPDATE "BankStatement" s
SET "tenantId" = b."tenantId"
FROM "Building" b
WHERE s."buildingId" = b.id AND s."tenantId" IS NULL;

-- Meetings without tenant: inherit from building (no more "visible to everyone")
UPDATE "Meeting" mt
SET "tenantId" = b."tenantId"
FROM "Building" b
WHERE mt."buildingId" = b.id AND mt."tenantId" IS NULL;

-- Existing categories stay a shared system catalog (tenantId NULL).
DROP INDEX IF EXISTS "ExpenseCategory_code_key";
CREATE UNIQUE INDEX "ExpenseCategory_tenantId_code_key" ON "ExpenseCategory"("tenantId", "code");
CREATE INDEX "ExpenseCategory_tenantId_idx" ON "ExpenseCategory"("tenantId");

CREATE INDEX "Reminder_tenantId_sentAt_idx" ON "Reminder"("tenantId", "sentAt");
CREATE INDEX "BankStatement_tenantId_importedAt_idx" ON "BankStatement"("tenantId", "importedAt");
CREATE INDEX IF NOT EXISTS "BankStatementLine_createdAt_idx" ON "BankStatementLine"("createdAt");

ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Meetings: one participant / one vote per apartment (H3) ────────────────
-- Fill missing apartmentId from the user's primary apartment where possible.
UPDATE "MeetingVote" v SET "apartmentId" = u."apartmentId"
FROM "User" u WHERE v."userId" = u.id AND v."apartmentId" IS NULL AND u."apartmentId" IS NOT NULL;
UPDATE "MeetingParticipant" p SET "apartmentId" = u."apartmentId"
FROM "User" u WHERE p."userId" = u.id AND p."apartmentId" IS NULL AND u."apartmentId" IS NOT NULL;

-- Duplicate votes for the same apartment: keep the most recent one.
DELETE FROM "MeetingVote" v
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "agendaItemId", "apartmentId" ORDER BY "createdAt" DESC, id DESC
  ) AS rn
  FROM "MeetingVote" WHERE "apartmentId" IS NOT NULL
) d
WHERE v.id = d.id AND d.rn > 1;

-- Duplicate participants for the same apartment: keep the earliest registration.
DELETE FROM "MeetingParticipant" p
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "meetingId", "apartmentId" ORDER BY "registeredAt" ASC, id ASC
  ) AS rn
  FROM "MeetingParticipant" WHERE "apartmentId" IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

DROP INDEX IF EXISTS "MeetingParticipant_meetingId_userId_key";
DROP INDEX IF EXISTS "MeetingVote_agendaItemId_userId_key";
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_apartmentId_key" ON "MeetingParticipant"("meetingId", "apartmentId");
CREATE INDEX "MeetingParticipant_meetingId_userId_idx" ON "MeetingParticipant"("meetingId", "userId");
CREATE UNIQUE INDEX "MeetingVote_agendaItemId_apartmentId_key" ON "MeetingVote"("agendaItemId", "apartmentId");
CREATE INDEX "MeetingVote_agendaItemId_userId_idx" ON "MeetingVote"("agendaItemId", "userId");

-- ─── Accrual idempotency (M6) ────────────────────────────────────────────────
-- Rename pre-existing duplicates so the unique index can be created safely.
UPDATE "Accrual" a
SET "title" = a."title" || ' (дубль ' || d.rn || ')'
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "fundId", "period", "title" ORDER BY "createdAt" ASC, id ASC
  ) AS rn
  FROM "Accrual"
) d
WHERE a.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX "Accrual_fundId_period_title_key" ON "Accrual"("fundId", "period", "title");
CREATE INDEX "Accrual_period_idx" ON "Accrual"("period");

-- ─── Indexes (M7) ────────────────────────────────────────────────────────────
CREATE INDEX "AccrualLine_accrualId_idx" ON "AccrualLine"("accrualId");
CREATE INDEX "AccrualLine_apartmentId_status_dueDate_idx" ON "AccrualLine"("apartmentId", "status", "dueDate");
CREATE INDEX "Payment_apartmentId_date_idx" ON "Payment"("apartmentId", "date");
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX "PaymentAllocation_accrualLineId_idx" ON "PaymentAllocation"("accrualLineId");

-- ─── Journal entry numbering (M1) ────────────────────────────────────────────
CREATE TABLE "JournalSequence" (
    "buildingId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNo" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalSequence_pkey" PRIMARY KEY ("buildingId", "year")
);

INSERT INTO "JournalSequence" ("buildingId", "year", "lastNo")
SELECT "buildingId",
       EXTRACT(YEAR FROM "valueDate" AT TIME ZONE 'UTC')::int,
       MAX("entryNo")
FROM "JournalEntry"
WHERE "buildingId" IS NOT NULL AND "entryNo" IS NOT NULL AND "valueDate" IS NOT NULL
GROUP BY 1, 2
ON CONFLICT DO NOTHING;
