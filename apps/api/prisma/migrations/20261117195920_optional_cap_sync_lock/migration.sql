-- AlterTable
ALTER TABLE "RuleSet" ALTER COLUMN "dailyCapPerPlayer" DROP NOT NULL;

-- Une seule synchronisation en cours par club (verrou garanti par la base).
CREATE UNIQUE INDEX "SyncRun_one_running_per_club" ON "SyncRun"("clubId") WHERE status = 'RUNNING';
