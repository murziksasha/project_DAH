-- AlterTable User: 2FA + email prefs
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpTempSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailNotifyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- EmailLog
CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_to_idx" ON "EmailLog"("to");

-- Reminder
CREATE TABLE IF NOT EXISTS "Reminder" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "userId" TEXT,
    "apartmentId" TEXT,
    "createdById" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Reminder_dueAt_sentAt_idx" ON "Reminder"("dueAt", "sentAt");
CREATE INDEX IF NOT EXISTS "Reminder_userId_idx" ON "Reminder"("userId");

ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_userId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_apartmentId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_apartmentId_fkey"
  FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_createdById_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
