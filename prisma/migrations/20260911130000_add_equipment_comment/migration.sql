-- CreateTable
CREATE TABLE "EquipmentComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipmentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "EquipmentComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentComment_equipmentId_idx" ON "EquipmentComment"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentComment_authorId_idx" ON "EquipmentComment"("authorId");

-- AddForeignKey
ALTER TABLE "EquipmentComment" ADD CONSTRAINT "EquipmentComment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentComment" ADD CONSTRAINT "EquipmentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
