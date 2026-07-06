-- AlterEnum
ALTER TYPE "OSScope" ADD VALUE 'REVISAO';

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "oilLiters" TEXT,
ADD COLUMN     "revisionDate" TIMESTAMP(3),
ADD COLUMN     "revisionFilters" TEXT;
