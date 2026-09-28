-- CreateEnum
CREATE TYPE "PauseReason" AS ENUM ('AGUARDANDO_TERCEIRO', 'AGUARDANDO_ESTOQUE', 'ALMOCO', 'FIM_EXPEDIENTE', 'OUTRO');

-- CreateTable
CREATE TABLE "WorkOrderPause" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "reason" "PauseReason" NOT NULL,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "WorkOrderPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderPause_workOrderId_idx" ON "WorkOrderPause"("workOrderId");

-- AddForeignKey
ALTER TABLE "WorkOrderPause" ADD CONSTRAINT "WorkOrderPause_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPause" ADD CONSTRAINT "WorkOrderPause_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
