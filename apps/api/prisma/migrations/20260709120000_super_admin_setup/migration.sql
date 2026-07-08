-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'super_admin';

-- AlterTable
ALTER TABLE "Building" ADD COLUMN IF NOT EXISTS "isInitialized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Building" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';

-- Existing deployments with data are considered initialized
UPDATE "Building" SET "isInitialized" = true WHERE "isInitialized" = false;