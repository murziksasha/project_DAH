-- M8: tenant FKs for tenant-owned content + backfill; L10: unique global CoA codes.
-- Safe for existing data: only fills NULL / orphan tenantId values, never deletes rows.

-- 1. Orphan tenant ids (tenant was removed) -> NULL, re-derived below.
UPDATE "Announcement" SET "tenantId" = NULL WHERE "tenantId" IS NOT NULL AND "tenantId" NOT IN (SELECT "id" FROM "Tenant");
UPDATE "Request"      SET "tenantId" = NULL WHERE "tenantId" IS NOT NULL AND "tenantId" NOT IN (SELECT "id" FROM "Tenant");
UPDATE "Poll"         SET "tenantId" = NULL WHERE "tenantId" IS NOT NULL AND "tenantId" NOT IN (SELECT "id" FROM "Tenant");
UPDATE "Document"     SET "tenantId" = NULL WHERE "tenantId" IS NOT NULL AND "tenantId" NOT IN (SELECT "id" FROM "Tenant");
UPDATE "Meeting"      SET "tenantId" = NULL WHERE "tenantId" IS NOT NULL AND "tenantId" NOT IN (SELECT "id" FROM "Tenant");

-- 2. Backfill from building.
UPDATE "Announcement" t SET "tenantId" = b."tenantId" FROM "Building" b WHERE t."tenantId" IS NULL AND t."buildingId" = b."id";
UPDATE "Request"      t SET "tenantId" = b."tenantId" FROM "Building" b WHERE t."tenantId" IS NULL AND t."buildingId" = b."id";
UPDATE "Request"      t SET "tenantId" = b."tenantId" FROM "Apartment" a JOIN "Building" b ON b."id" = a."buildingId"
  WHERE t."tenantId" IS NULL AND t."apartmentId" = a."id";
UPDATE "Poll"         t SET "tenantId" = b."tenantId" FROM "Building" b WHERE t."tenantId" IS NULL AND t."buildingId" = b."id";
UPDATE "Document"     t SET "tenantId" = b."tenantId" FROM "Building" b WHERE t."tenantId" IS NULL AND t."buildingId" = b."id";
UPDATE "Meeting"      t SET "tenantId" = b."tenantId" FROM "Building" b WHERE t."tenantId" IS NULL AND t."buildingId" = b."id";

-- Announcement author's organization (single active tenant of the author).
UPDATE "Announcement" t SET "tenantId" = u."tenantId" FROM "User" u
  WHERE t."tenantId" IS NULL AND t."authorId" = u."id" AND u."tenantId" IS NOT NULL;

-- 3. Single-organization installs: remaining rows belong to the only tenant.
DO $$
DECLARE only_tenant TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM "Tenant") = 1 THEN
    SELECT "id" INTO only_tenant FROM "Tenant" LIMIT 1;
    UPDATE "Announcement" SET "tenantId" = only_tenant WHERE "tenantId" IS NULL;
    UPDATE "Request"      SET "tenantId" = only_tenant WHERE "tenantId" IS NULL;
    UPDATE "Poll"         SET "tenantId" = only_tenant WHERE "tenantId" IS NULL;
    UPDATE "Document"     SET "tenantId" = only_tenant WHERE "tenantId" IS NULL;
    UPDATE "Meeting"      SET "tenantId" = only_tenant WHERE "tenantId" IS NULL;
  END IF;
END $$;

-- 4. Foreign keys.
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. L10: global chart-of-accounts codes unique (NULL buildingId is not covered by the composite unique).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LedgerAccount" WHERE "buildingId" IS NULL GROUP BY "code" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'LedgerAccount: duplicate global codes found, unique index skipped (clean up and re-run CREATE UNIQUE INDEX manually)';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAccount_global_code_key" ON "LedgerAccount" ("code") WHERE "buildingId" IS NULL;
  END IF;
END $$;
