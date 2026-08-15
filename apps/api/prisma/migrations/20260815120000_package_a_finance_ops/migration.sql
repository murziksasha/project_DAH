-- Package A: accounting periods, bank statements, IBAN aliases

CREATE TYPE "AccountingPeriodStatus" AS ENUM ('open', 'soft_closed', 'locked');
CREATE TYPE "BankStatementStatus" AS ENUM ('preview', 'committed', 'partial');
CREATE TYPE "BankStatementLineStatus" AS ENUM ('matched', 'unmatched', 'skipped', 'invalid', 'manual', 'imported', 'ignored');

CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT,
    "format" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "rawHash" TEXT,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'preview',
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "amount" DECIMAL(12,2),
    "reference" TEXT NOT NULL DEFAULT '',
    "counterpartyIban" TEXT,
    "extractedApartment" TEXT,
    "raw" TEXT NOT NULL DEFAULT '',
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'unmatched',
    "matchMethod" TEXT,
    "confidence" DOUBLE PRECISION,
    "apartmentId" TEXT,
    "paymentId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IbanApartmentAlias" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IbanApartmentAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingPeriod_buildingId_period_key" ON "AccountingPeriod"("buildingId", "period");
CREATE INDEX "AccountingPeriod_buildingId_status_idx" ON "AccountingPeriod"("buildingId", "status");

CREATE INDEX "BankStatement_buildingId_importedAt_idx" ON "BankStatement"("buildingId", "importedAt");
CREATE INDEX "BankStatement_rawHash_idx" ON "BankStatement"("rawHash");

CREATE UNIQUE INDEX "BankStatementLine_statementId_lineNo_key" ON "BankStatementLine"("statementId", "lineNo");
CREATE INDEX "BankStatementLine_statementId_status_idx" ON "BankStatementLine"("statementId", "status");
CREATE INDEX "BankStatementLine_paymentId_idx" ON "BankStatementLine"("paymentId");
CREATE INDEX "BankStatementLine_apartmentId_idx" ON "BankStatementLine"("apartmentId");

CREATE UNIQUE INDEX "IbanApartmentAlias_buildingId_iban_key" ON "IbanApartmentAlias"("buildingId", "iban");
CREATE INDEX "IbanApartmentAlias_iban_idx" ON "IbanApartmentAlias"("iban");

ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbanApartmentAlias" ADD CONSTRAINT "IbanApartmentAlias_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
