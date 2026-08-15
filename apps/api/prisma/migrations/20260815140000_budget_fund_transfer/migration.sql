-- Budget plan/fact + inter-fund transfers

CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "fundId" TEXT,
    "categoryId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "plannedAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FundTransfer" (
    "id" TEXT NOT NULL,
    "fromFundId" TEXT NOT NULL,
    "toFundId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetLine_buildingId_year_idx" ON "BudgetLine"("buildingId", "year");
CREATE INDEX "BudgetLine_fundId_idx" ON "BudgetLine"("fundId");
CREATE INDEX "BudgetLine_categoryId_idx" ON "BudgetLine"("categoryId");

CREATE INDEX "FundTransfer_fromFundId_date_idx" ON "FundTransfer"("fromFundId", "date");
CREATE INDEX "FundTransfer_toFundId_date_idx" ON "FundTransfer"("toFundId", "date");

ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FundTransfer" ADD CONSTRAINT "FundTransfer_fromFundId_fkey" FOREIGN KEY ("fromFundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundTransfer" ADD CONSTRAINT "FundTransfer_toFundId_fkey" FOREIGN KEY ("toFundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
