-- CreateEnum
CREATE TYPE "MaintenanceSeverity" AS ENUM ('LEVE', 'PESADA');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN "maintenanceSeverity" "MaintenanceSeverity",
ADD COLUMN "maintenanceExpectedDate" TIMESTAMP(3);
