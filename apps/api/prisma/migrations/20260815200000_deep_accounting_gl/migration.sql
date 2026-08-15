-- Deep accounting (GL-0 … GL-6): CoA, journal v2, AP, bank rec, AR write-off, tariffs, close snapshots

-- Enums
CREATE TYPE "LedgerAccountType" AS ENUM ('asset', 'liability', 'equity', 'income', 'expense', 'off_balance');
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('draft', 'approved', 'partially_paid', 'paid', 'voided');
CREATE TYPE "BankReconciliationStatus" AS ENUM ('open', 'balanced', 'closed');
CREATE TYPE "DebtWriteOffStatus" AS ENUM ('pending', 'approved', 'voided');

-- Extend JournalEntryType
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'fund_transfer';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'penalty';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'accrual_reverse';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'write_off';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'supplier_invoice';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'supplier_payment';
ALTER TYPE "JournalEntryType" ADD VALUE IF NOT EXISTS 'bank_fee';

-- LedgerAccount
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "externalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerAccount_buildingId_code_key" ON "LedgerAccount"("buildingId", "code");
CREATE INDEX "LedgerAccount_code_idx" ON "LedgerAccount"("code");
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JournalEntry extensions
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "valueDate" TIMESTAMP(3);
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "period" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "entryNo" INTEGER;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "reversesId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "JournalEntry_buildingId_period_idx" ON "JournalEntry"("buildingId", "period");
CREATE INDEX IF NOT EXISTS "JournalEntry_buildingId_entryNo_idx" ON "JournalEntry"("buildingId", "entryNo");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JournalLine extensions
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "serviceId" TEXT;

CREATE INDEX IF NOT EXISTS "JournalLine_account_fundId_idx" ON "JournalLine"("account", "fundId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX IF NOT EXISTS "JournalLine_supplierId_idx" ON "JournalLine"("supplierId");
CREATE INDEX IF NOT EXISTS "JournalLine_bankAccountId_idx" ON "JournalLine"("bankAccountId");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ServiceTariff
CREATE TABLE "ServiceTariff" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distribution" "AccrualDistribution" NOT NULL DEFAULT 'by_area',
    "rate" DECIMAL(12,4),
    "fixedAmount" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTariff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceTariff_buildingId_isActive_idx" ON "ServiceTariff"("buildingId", "isActive");
CREATE INDEX "ServiceTariff_fundId_idx" ON "ServiceTariff"("fundId");
ALTER TABLE "ServiceTariff" ADD CONSTRAINT "ServiceTariff_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTariff" ADD CONSTRAINT "ServiceTariff_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SupplierInvoice
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "categoryId" TEXT,
    "number" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "documentKey" TEXT,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'draft',
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierInvoice_buildingId_date_idx" ON "SupplierInvoice"("buildingId", "date");
CREATE INDEX "SupplierInvoice_supplierId_status_idx" ON "SupplierInvoice"("supplierId", "status");
CREATE INDEX "SupplierInvoice_fundId_idx" ON "SupplierInvoice"("fundId");
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SupplierPayment
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" "PaymentSource" NOT NULL DEFAULT 'bank',
    "reference" TEXT,
    "description" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierPayment_supplierId_date_idx" ON "SupplierPayment"("supplierId", "date");
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierPaymentAllocation_paymentId_idx" ON "SupplierPaymentAllocation"("paymentId");
CREATE INDEX "SupplierPaymentAllocation_invoiceId_idx" ON "SupplierPaymentAllocation"("invoiceId");
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BankReconciliation
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "statementBalance" DECIMAL(14,2) NOT NULL,
    "glBalance" DECIMAL(14,2),
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankReconciliation_bankAccountId_period_key" ON "BankReconciliation"("bankAccountId", "period");
CREATE INDEX "BankReconciliation_buildingId_period_idx" ON "BankReconciliation"("buildingId", "period");
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DebtWriteOff
CREATE TABLE "DebtWriteOff" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "accrualLineId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DebtWriteOffStatus" NOT NULL DEFAULT 'pending',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtWriteOff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DebtWriteOff_buildingId_status_idx" ON "DebtWriteOff"("buildingId", "status");
CREATE INDEX "DebtWriteOff_apartmentId_idx" ON "DebtWriteOff"("apartmentId");
ALTER TABLE "DebtWriteOff" ADD CONSTRAINT "DebtWriteOff_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtWriteOff" ADD CONSTRAINT "DebtWriteOff_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PeriodCloseSnapshot
CREATE TABLE "PeriodCloseSnapshot" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodCloseSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PeriodCloseSnapshot_buildingId_period_idx" ON "PeriodCloseSnapshot"("buildingId", "period");
ALTER TABLE "PeriodCloseSnapshot" ADD CONSTRAINT "PeriodCloseSnapshot_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed global default CoA (buildingId NULL) — unique index allows multiple NULLs in PG for (buildingId, code)
-- Use a sentinel: we insert global rows with buildingId = NULL; uniqueness is per building.

INSERT INTO "LedgerAccount" ("id", "buildingId", "code", "name", "type", "isControl", "isActive", "externalCode", "createdAt", "updatedAt") VALUES
  ('la_cash', NULL, 'cash', 'Грошові кошти / банк', 'asset', true, true, '311', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_receivable', NULL, 'receivable', 'Дебіторка мешканців', 'asset', true, true, '361', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_advance', NULL, 'advance', 'Аванси мешканців', 'liability', true, true, '681', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_expense', NULL, 'expense', 'Витрати', 'expense', false, true, '92', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_fund_balance', NULL, 'fund_balance', 'Фонди / цільове фінансування', 'equity', true, true, '48', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_payable', NULL, 'payable', 'Кредиторка постачальників', 'liability', true, true, '631', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_income', NULL, 'income', 'Доходи (нарахування)', 'income', false, true, '703', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_penalty_income', NULL, 'penalty_income', 'Пеня / штрафи', 'income', false, true, '719', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_write_off', NULL, 'write_off', 'Списання безнадійної заборгованості', 'expense', false, true, '944', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_clearing', NULL, 'clearing', 'Внутрішні перекази (clearing)', 'off_balance', false, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('la_suspense', NULL, 'suspense', 'Technical / suspense', 'off_balance', false, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
