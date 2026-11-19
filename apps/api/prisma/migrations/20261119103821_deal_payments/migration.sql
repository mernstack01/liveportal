-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'INTERIM', 'FINAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "advancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "readyNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "DealPayment" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'ADVANCE',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealPayment_dealId_status_idx" ON "DealPayment"("dealId", "status");

-- CreateIndex
CREATE INDEX "DealPayment_status_idx" ON "DealPayment"("status");

-- CreateIndex
CREATE INDEX "Attachment_paymentId_idx" ON "Attachment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_projectId_key" ON "Deal"("projectId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DealPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

