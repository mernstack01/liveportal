-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "incidentId" TEXT;

-- CreateIndex
CREATE INDEX "Task_incidentId_idx" ON "Task"("incidentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

