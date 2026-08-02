-- Track who approved / activated a user account
ALTER TABLE "User" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "approvedById" TEXT;

CREATE INDEX "User_approvedById_idx" ON "User"("approvedById");

ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from audit log (latest auth.approve per user entity)
UPDATE "User" u
SET
  "approvedAt" = a."createdAt",
  "approvedById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "userId",
    "createdAt"
  FROM "AuditLog"
  WHERE "action" = 'auth.approve' AND "entityType" = 'User'
  ORDER BY "entityId", "createdAt" DESC
) a
WHERE u."id" = a."entityId"
  AND u."approvedAt" IS NULL
  AND a."userId" IS NOT NULL;
