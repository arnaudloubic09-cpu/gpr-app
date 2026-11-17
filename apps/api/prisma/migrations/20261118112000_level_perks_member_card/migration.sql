-- AlterTable
ALTER TABLE "Reward" DROP COLUMN "minLevel";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memberCode" TEXT;

-- CreateTable
CREATE TABLE "LevelPerk" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "levelCode" TEXT NOT NULL,
    "category" "RewardCategory" NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelPerk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LevelPerk_clubId_isActive_idx" ON "LevelPerk"("clubId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberCode_key" ON "User"("memberCode");

-- AddForeignKey
ALTER TABLE "LevelPerk" ADD CONSTRAINT "LevelPerk_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Avantages : réduction en pourcentage raisonnable, catégories autorisées (pas de partie de padel).
ALTER TABLE "LevelPerk" ADD CONSTRAINT level_perk_discount CHECK ("discountPercent" BETWEEN 1 AND 50);
ALTER TABLE "LevelPerk" ADD CONSTRAINT level_perk_category CHECK (category IN ('DRINK', 'SNACK', 'EQUIPMENT', 'TOURNAMENT', 'LESSON'));
