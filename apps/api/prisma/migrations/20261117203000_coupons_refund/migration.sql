-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reward" DROP COLUMN "couponValidityDays";

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "couponValidityDays" INTEGER NOT NULL DEFAULT 7;

