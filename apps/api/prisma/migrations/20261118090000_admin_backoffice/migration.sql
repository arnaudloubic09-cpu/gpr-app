-- AlterTable
ALTER TABLE "ClubConnectorConfig" ADD COLUMN     "failureAlertSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "clubAdjustmentMax" INTEGER NOT NULL DEFAULT 200;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3);


ALTER TABLE "RuleSet" ADD CONSTRAINT ruleset_adjustment_max CHECK ("clubAdjustmentMax" BETWEEN 0 AND 100000);
