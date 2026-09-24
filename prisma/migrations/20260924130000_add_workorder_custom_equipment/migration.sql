-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "equipmentId" DROP NOT NULL,
ADD COLUMN "customEquipmentLabel" TEXT;
