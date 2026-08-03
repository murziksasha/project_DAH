-- AlterTable MeetingSignature
ALTER TABLE "MeetingSignature" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "MeetingSignature_sessionId_idx" ON "MeetingSignature"("sessionId");

-- CreateTable SignSession
CREATE TABLE "SignSession" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "digest" TEXT NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "documentText" TEXT,
    "challenge" TEXT NOT NULL,
    "externalSessionId" TEXT,
    "authorizeUrl" TEXT,
    "deeplink" TEXT,
    "signatureCms" TEXT,
    "certificateSubject" TEXT,
    "certificateSerial" TEXT,
    "resultPayload" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignSession_userId_status_idx" ON "SignSession"("userId", "status");
CREATE INDEX "SignSession_refType_refId_idx" ON "SignSession"("refType", "refId");
CREATE INDEX "SignSession_externalSessionId_idx" ON "SignSession"("externalSessionId");
CREATE INDEX "SignSession_expiresAt_idx" ON "SignSession"("expiresAt");
