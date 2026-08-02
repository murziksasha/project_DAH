-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('osbb', 'management_company');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "orgType" "OrganizationType" NOT NULL DEFAULT 'osbb';
