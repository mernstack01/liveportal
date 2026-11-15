-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "incidentUpdateId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_incidentUpdateId_idx" ON "Attachment"("incidentUpdateId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_incidentUpdateId_fkey" FOREIGN KEY ("incidentUpdateId") REFERENCES "IncidentUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

