-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "TenantMembership"("tenantId", "role");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_status_idx" ON "TenantMembership"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill memberships from existing User.tenantId / role / status (exclude platform super_admin)
INSERT INTO "TenantMembership" ("id", "userId", "tenantId", "role", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."tenantId",
  u."role",
  u."status",
  u."createdAt",
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."tenantId" IS NOT NULL
  AND u."role" <> 'super_admin'
ON CONFLICT ("userId", "tenantId") DO NOTHING;
