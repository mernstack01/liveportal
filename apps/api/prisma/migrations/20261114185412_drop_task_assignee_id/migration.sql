-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropIndex
DROP INDEX "Task_assigneeId_statusId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "assigneeId";
