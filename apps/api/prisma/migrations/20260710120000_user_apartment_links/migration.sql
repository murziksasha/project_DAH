-- CreateTable
CREATE TABLE "UserApartment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserApartment_userId_apartmentId_key" ON "UserApartment"("userId", "apartmentId");

-- CreateIndex
CREATE INDEX "UserApartment_apartmentId_idx" ON "UserApartment"("apartmentId");

-- AddForeignKey
ALTER TABLE "UserApartment" ADD CONSTRAINT "UserApartment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApartment" ADD CONSTRAINT "UserApartment_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing User.apartmentId links
INSERT INTO "UserApartment" ("id", "userId", "apartmentId", "isPrimary", "createdAt")
SELECT
    'ua_' || "id",
    "id",
    "apartmentId",
    true,
    NOW()
FROM "User"
WHERE "apartmentId" IS NOT NULL;