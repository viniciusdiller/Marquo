-- CreateEnum
CREATE TYPE "TimeBlockRecurrence" AS ENUM ('NONE', 'DAILY');

-- AlterTable
ALTER TABLE "TimeBlock" ADD COLUMN     "recurrence" "TimeBlockRecurrence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "repeatUntil" DATE;

