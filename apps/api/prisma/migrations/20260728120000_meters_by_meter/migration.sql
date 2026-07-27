-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('cold_water', 'hot_water', 'heating', 'electricity', 'other');

-- AlterEnum
ALTER TYPE "AccrualDistribution" ADD VALUE 'by_meter';

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "type" "MeterType" NOT NULL DEFAULT 'cold_water',
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'm3',
    "serialNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(14,3) NOT NULL,
    "previousValue" DECIMAL(14,3),
    "consumption" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Meter_apartmentId_idx" ON "Meter"("apartmentId");
CREATE INDEX "Meter_type_idx" ON "Meter"("type");
CREATE UNIQUE INDEX "MeterReading_meterId_period_key" ON "MeterReading"("meterId", "period");
CREATE INDEX "MeterReading_period_idx" ON "MeterReading"("period");

ALTER TABLE "Meter" ADD CONSTRAINT "Meter_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
