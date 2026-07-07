-- CreateEnum
CREATE TYPE "ReadingFrequency" AS ENUM ('SEMANAL', 'QUINZENAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('DISPONIVEL', 'LOCADO');

-- CreateEnum
CREATE TYPE "ReadingSource" AS ENUM ('MANUAL', 'CSV');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "currentClient" TEXT,
ADD COLUMN     "lastLocationUpdate" TIMESTAMP(3),
ADD COLUMN     "lastMaintenanceHorimeter" DOUBLE PRECISION,
ADD COLUMN     "lastReadingDate" TIMESTAMP(3),
ADD COLUMN     "leaseStatus" "LeaseStatus" NOT NULL DEFAULT 'DISPONIVEL',
ADD COLUMN     "locationSource" "ReadingSource",
ADD COLUMN     "maintenanceIntervalHours" DOUBLE PRECISION,
ADD COLUMN     "nextReadingDate" TIMESTAMP(3),
ADD COLUMN     "readingFrequency" "ReadingFrequency" NOT NULL DEFAULT 'MENSAL';

-- CreateTable
CREATE TABLE "HorimeterReading" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "ReadingSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorimeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrequencyChangeLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "previousValue" "ReadingFrequency",
    "newValue" "ReadingFrequency" NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrequencyChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "leasedCount" INTEGER NOT NULL DEFAULT 0,
    "availableCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorimeterReading_equipmentId_idx" ON "HorimeterReading"("equipmentId");

-- CreateIndex
CREATE INDEX "HorimeterReading_readingDate_idx" ON "HorimeterReading"("readingDate");

-- CreateIndex
CREATE INDEX "FrequencyChangeLog_equipmentId_idx" ON "FrequencyChangeLog"("equipmentId");

-- CreateIndex
CREATE INDEX "LocationImport_createdAt_idx" ON "LocationImport"("createdAt");

-- CreateIndex
CREATE INDEX "Equipment_leaseStatus_idx" ON "Equipment"("leaseStatus");

-- CreateIndex
CREATE INDEX "Equipment_nextReadingDate_idx" ON "Equipment"("nextReadingDate");

-- AddForeignKey
ALTER TABLE "HorimeterReading" ADD CONSTRAINT "HorimeterReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorimeterReading" ADD CONSTRAINT "HorimeterReading_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrequencyChangeLog" ADD CONSTRAINT "FrequencyChangeLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrequencyChangeLog" ADD CONSTRAINT "FrequencyChangeLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationImport" ADD CONSTRAINT "LocationImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
