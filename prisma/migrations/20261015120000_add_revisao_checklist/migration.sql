-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('OK', 'ATENCAO', 'INDISPONIVEL');

-- AlterTable
ALTER TABLE "WorkOrderPhoto" ADD COLUMN "itemKey" TEXT;

-- CreateTable
CREATE TABLE "WorkOrderChecklistItem" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderChecklistItem_workOrderId_itemKey_key" ON "WorkOrderChecklistItem"("workOrderId", "itemKey");

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
