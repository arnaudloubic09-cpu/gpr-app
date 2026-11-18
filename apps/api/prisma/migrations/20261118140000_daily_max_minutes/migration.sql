-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "dailyMaxMinutes" INTEGER DEFAULT 90;

ALTER TABLE "RuleSet" ADD CONSTRAINT ruleset_daily_max_minutes CHECK ("dailyMaxMinutes" IS NULL OR "dailyMaxMinutes" BETWEEN 30 AND 1440);
