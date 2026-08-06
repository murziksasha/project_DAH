-- AlterEnum: UserRole + dispatcher
ALTER TYPE "UserRole" ADD VALUE 'dispatcher';

-- CreateEnum RequestPriority
CREATE TYPE "RequestPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- AlterTable Request
ALTER TABLE "Request" ADD COLUMN "priority" "RequestPriority" NOT NULL DEFAULT 'normal';

CREATE INDEX "Request_status_dueAt_idx" ON "Request"("status", "dueAt");
CREATE INDEX "Request_assigneeId_status_idx" ON "Request"("assigneeId", "status");
