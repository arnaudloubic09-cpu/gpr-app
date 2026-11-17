-- CreateEnum
CREATE TYPE "VipSource" AS ENUM ('PLATINUM', 'PURCHASE', 'MANUAL');

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "VipMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "VipSource" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "paymentRef" TEXT,
    "amountCents" INTEGER,
    "reason" TEXT,
    "grantedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VipMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "description" TEXT,
    "websiteUrl" TEXT,
    "maxCodesPerMember" INTEGER,
    "codeValidityDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lowStockAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCode" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedToId" UUID,
    "assignedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PartnerCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VipMembership_paymentRef_key" ON "VipMembership"("paymentRef");

-- CreateIndex
CREATE INDEX "VipMembership_userId_endsAt_idx" ON "VipMembership"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "PartnerCode_partnerId_assignedToId_idx" ON "PartnerCode"("partnerId", "assignedToId");

-- CreateIndex
CREATE INDEX "PartnerCode_assignedToId_idx" ON "PartnerCode"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCode_partnerId_code_key" ON "PartnerCode"("partnerId", "code");

-- AddForeignKey
ALTER TABLE "VipMembership" ADD CONSTRAINT "VipMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCode" ADD CONSTRAINT "PartnerCode_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCode" ADD CONSTRAINT "PartnerCode_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "VipMembership" ADD CONSTRAINT vip_period_order CHECK ("endsAt" > "startsAt");
ALTER TABLE "Partner" ADD CONSTRAINT partner_limits CHECK (("maxCodesPerMember" IS NULL OR "maxCodesPerMember" >= 1) AND "codeValidityDays" BETWEEN 1 AND 365);
-- Un code attribué a toujours une date d'attribution
ALTER TABLE "PartnerCode" ADD CONSTRAINT partner_code_assignment CHECK (("assignedToId" IS NULL) = ("assignedAt" IS NULL) OR "assignedAt" IS NOT NULL);
