-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Default tenant for existing single-OSBB installs
INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "settings", "createdAt", "updatedAt")
VALUES ('default_tenant_v1', 'Default OSBB', 'default', true, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Building.tenantId
ALTER TABLE "Building" ADD COLUMN "tenantId" TEXT;
UPDATE "Building" SET "tenantId" = 'default_tenant_v1' WHERE "tenantId" IS NULL;
ALTER TABLE "Building" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "Building_tenantId_idx" ON "Building"("tenantId");
ALTER TABLE "Building" ADD CONSTRAINT "Building_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- User.tenantId (super_admin may stay null)
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
UPDATE "User" SET "tenantId" = 'default_tenant_v1' WHERE "role" <> 'super_admin';
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
