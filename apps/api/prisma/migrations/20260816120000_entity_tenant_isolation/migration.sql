-- AlterTable AuthSession
ALTER TABLE "AuthSession" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "role" "UserRole";
CREATE INDEX "AuthSession_tenantId_idx" ON "AuthSession"("tenantId");

-- AlterTable Announcement
ALTER TABLE "Announcement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "buildingId" TEXT;
CREATE INDEX "Announcement_tenantId_idx" ON "Announcement"("tenantId");
CREATE INDEX "Announcement_buildingId_idx" ON "Announcement"("buildingId");

-- AlterTable Request
ALTER TABLE "Request" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Request" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "Request" ADD COLUMN "apartmentId" TEXT;
CREATE UNIQUE INDEX "Request_clientRequestId_key" ON "Request"("clientRequestId");
CREATE INDEX "Request_tenantId_status_idx" ON "Request"("tenantId", "status");
CREATE INDEX "Request_apartmentId_idx" ON "Request"("apartmentId");
ALTER TABLE "Request" ADD CONSTRAINT "Request_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Poll
ALTER TABLE "Poll" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Poll" ADD COLUMN "buildingId" TEXT;
CREATE INDEX "Poll_tenantId_idx" ON "Poll"("tenantId");
CREATE INDEX "Poll_buildingId_idx" ON "Poll"("buildingId");

-- AlterTable Document
ALTER TABLE "Document" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Document" ADD COLUMN "buildingId" TEXT;
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");
CREATE INDEX "Document_buildingId_idx" ON "Document"("buildingId");

-- AlterTable AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "isPlatform" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AlterTable Meeting
ALTER TABLE "Meeting" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Meeting_tenantId_idx" ON "Meeting"("tenantId");

-- Backfill existing data
UPDATE "Announcement" a
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE a."authorId" = u.id AND a."tenantId" IS NULL;

UPDATE "Request" r
SET "tenantId" = b."tenantId"
FROM "Building" b
WHERE r."buildingId" = b.id AND r."tenantId" IS NULL;

UPDATE "Request" r
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE r."authorId" = u.id AND r."tenantId" IS NULL;

UPDATE "Meeting" m
SET "tenantId" = b."tenantId"
FROM "Building" b
WHERE m."buildingId" = b.id AND m."tenantId" IS NULL;
