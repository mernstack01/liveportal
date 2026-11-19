-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW', 'DISCUSSION', 'PROPOSAL', 'CONTRACT', 'ADVANCE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealSource" AS ENUM ('TELEGRAM', 'INSTAGRAM', 'REFERRAL', 'WEBSITE', 'CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UZS', 'USD');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "dealActivityId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "dealCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientContact" TEXT,
    "source" "DealSource" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "amount" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "stage" "DealStage" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "nextStep" TEXT,
    "nextStepAt" TIMESTAMP(3),
    "stepRemindedAt" TIMESTAMP(3),
    "stepEscalatedAt" TIMESTAMP(3),
    "dueDate" DATE,
    "lostReason" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "from" TEXT,
    "to" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_workspaceId_stage_idx" ON "Deal"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_workspaceId_number_key" ON "Deal"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "DealActivity_dealId_createdAt_idx" ON "DealActivity"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_dealActivityId_idx" ON "Attachment"("dealActivityId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_dealActivityId_fkey" FOREIGN KEY ("dealActivityId") REFERENCES "DealActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

