-- CreateEnum
CREATE TYPE "OSScope" AS ENUM ('NORMAL', 'CHECKLIST', 'TESTE_CARGA');

-- DropForeignKey
ALTER TABLE "WorkOrder" DROP CONSTRAINT "WorkOrder_technicianId_fkey";

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "checkFuelFilter1" TEXT,
ADD COLUMN     "checkFuelFilter2" TEXT,
ADD COLUMN     "checkFuelFilter3" TEXT,
ADD COLUMN     "checklistDate" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "frequencyEmpty" TEXT,
ADD COLUMN     "frequencyLoad" TEXT,
ADD COLUMN     "load" TEXT,
ADD COLUMN     "loadTestDate" TIMESTAMP(3),
ADD COLUMN     "scope" "OSScope" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "tankSample" TEXT,
ADD COLUMN     "voltageEmpty" TEXT,
ALTER COLUMN "technicianId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WorkOrderComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workOrderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderComment_workOrderId_idx" ON "WorkOrderComment"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderComment_authorId_idx" ON "WorkOrderComment"("authorId");

-- CreateIndex
CREATE INDEX "WorkOrder_scope_idx" ON "WorkOrder"("scope");

-- CreateIndex
CREATE INDEX "WorkOrder_deletedAt_idx" ON "WorkOrder"("deletedAt");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
