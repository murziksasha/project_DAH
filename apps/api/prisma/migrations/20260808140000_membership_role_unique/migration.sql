-- Allow multiple roles per user within the same organization (e.g. board + resident).
-- Drop old unique (userId, tenantId); add unique (userId, tenantId, role).

DROP INDEX IF EXISTS "TenantMembership_userId_tenantId_key";

CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_role_key" ON "TenantMembership"("userId", "tenantId", "role");

CREATE INDEX IF NOT EXISTS "TenantMembership_userId_tenantId_idx" ON "TenantMembership"("userId", "tenantId");
