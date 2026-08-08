-- CreateTable
CREATE TABLE "TenantRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "labelUk" TEXT,
    "labelRu" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantRole_tenantId_isActive_idx" ON "TenantRole"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRole_tenantId_code_key" ON "TenantRole"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "TenantRole" ADD CONSTRAINT "TenantRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default org roles for every tenant (active)
INSERT INTO "TenantRole" ("id", "tenantId", "code", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  r.code::"UserRole",
  true,
  r.ord,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (
  VALUES
    ('chairman', 10),
    ('accountant', 20),
    ('board', 30),
    ('dispatcher', 40),
    ('crew', 50),
    ('auditor', 60),
    ('resident', 70)
) AS r(code, ord)
ON CONFLICT ("tenantId", "code") DO NOTHING;
