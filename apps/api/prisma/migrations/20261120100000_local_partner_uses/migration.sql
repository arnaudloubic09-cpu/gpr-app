-- AlterTable
ALTER TABLE "LocalPartner" ADD COLUMN     "email" TEXT,
ADD COLUMN     "portalToken" TEXT;
-- Partenaires existants : lien personnel aléatoire
UPDATE "LocalPartner" SET "portalToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "LocalPartner" ALTER COLUMN "portalToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "LocalPartnerUse" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalPartnerUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalPartnerUse_tokenHash_key" ON "LocalPartnerUse"("tokenHash");

-- CreateIndex
CREATE INDEX "LocalPartnerUse_partnerId_usedAt_idx" ON "LocalPartnerUse"("partnerId", "usedAt");

-- CreateIndex
CREATE INDEX "LocalPartnerUse_clubId_usedAt_idx" ON "LocalPartnerUse"("clubId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalPartner_portalToken_key" ON "LocalPartner"("portalToken");

-- AddForeignKey
ALTER TABLE "LocalPartnerUse" ADD CONSTRAINT "LocalPartnerUse_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LocalPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerUse" ADD CONSTRAINT "LocalPartnerUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

