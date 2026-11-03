-- CreateTable
CREATE TABLE "HorimeterCollectionAttempt" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorimeterCollectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorimeterCollectionAttempt_equipmentId_idx" ON "HorimeterCollectionAttempt"("equipmentId");

-- CreateIndex
CREATE INDEX "HorimeterCollectionAttempt_createdAt_idx" ON "HorimeterCollectionAttempt"("createdAt");

-- AddForeignKey
ALTER TABLE "HorimeterCollectionAttempt" ADD CONSTRAINT "HorimeterCollectionAttempt_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorimeterCollectionAttempt" ADD CONSTRAINT "HorimeterCollectionAttempt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
