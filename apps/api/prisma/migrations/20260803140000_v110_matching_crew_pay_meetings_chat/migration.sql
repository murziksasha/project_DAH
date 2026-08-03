-- AlterEnum UserRole
ALTER TYPE "UserRole" ADD VALUE 'crew';

-- Resident.iban
ALTER TABLE "Resident" ADD COLUMN "iban" TEXT;
CREATE INDEX "Resident_iban_idx" ON "Resident"("iban");

-- OnlinePaymentOrder
CREATE TABLE "OnlinePaymentOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "paymentId" TEXT,
    "providerMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlinePaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlinePaymentOrder_orderId_key" ON "OnlinePaymentOrder"("orderId");
CREATE UNIQUE INDEX "OnlinePaymentOrder_paymentId_key" ON "OnlinePaymentOrder"("paymentId");
CREATE INDEX "OnlinePaymentOrder_status_createdAt_idx" ON "OnlinePaymentOrder"("status", "createdAt");
CREATE INDEX "OnlinePaymentOrder_apartmentId_idx" ON "OnlinePaymentOrder"("apartmentId");

ALTER TABLE "OnlinePaymentOrder" ADD CONSTRAINT "OnlinePaymentOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Meeting enums
CREATE TYPE "MeetingStatus" AS ENUM ('draft', 'scheduled', 'open', 'closed', 'cancelled');
CREATE TYPE "MeetingType" AS ENUM ('general', 'board', 'founding', 'other');
CREATE TYPE "ChatThreadKind" AS ENUM ('building', 'entrance', 'board_residents', 'direct');

CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "MeetingType" NOT NULL DEFAULT 'general',
    "status" "MeetingStatus" NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "quorumPercent" DECIMAL(5,2),
    "voteWeight" "VoteWeightMode" NOT NULL DEFAULT 'one_per_apartment',
    "protocolText" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Meeting_status_scheduledAt_idx" ON "Meeting"("status", "scheduledAt");
CREATE INDEX "Meeting_buildingId_idx" ON "Meeting"("buildingId");
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB NOT NULL DEFAULT '["За","Проти","Утримався"]',

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingAgendaItem_meetingId_idx" ON "MeetingAgendaItem"("meetingId");
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT,
    "weight" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeetingVote" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT,
    "optionKey" TEXT NOT NULL,
    "weight" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingVote_agendaItemId_userId_key" ON "MeetingVote"("agendaItemId", "userId");
CREATE INDEX "MeetingVote_agendaItemId_idx" ON "MeetingVote"("agendaItemId");
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeetingSignature" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "signaturePayload" JSONB NOT NULL DEFAULT '{}',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingSignature_meetingId_userId_key" ON "MeetingSignature"("meetingId", "userId");
CREATE INDEX "MeetingSignature_meetingId_idx" ON "MeetingSignature"("meetingId");
ALTER TABLE "MeetingSignature" ADD CONSTRAINT "MeetingSignature_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingSignature" ADD CONSTRAINT "MeetingSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chat
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT,
    "kind" "ChatThreadKind" NOT NULL DEFAULT 'building',
    "title" TEXT,
    "entrance" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatThread_buildingId_kind_idx" ON "ChatThread"("buildingId", "kind");

CREATE TABLE "ChatThreadMember" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThreadMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatThreadMember_threadId_userId_key" ON "ChatThreadMember"("threadId", "userId");
CREATE INDEX "ChatThreadMember_userId_idx" ON "ChatThreadMember"("userId");
ALTER TABLE "ChatThreadMember" ADD CONSTRAINT "ChatThreadMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatThreadMember" ADD CONSTRAINT "ChatThreadMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
