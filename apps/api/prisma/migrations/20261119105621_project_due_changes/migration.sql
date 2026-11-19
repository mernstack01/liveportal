-- CreateTable
CREATE TABLE "ProjectDueChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "from" DATE,
    "to" DATE,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDueChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDueChange_projectId_createdAt_idx" ON "ProjectDueChange"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDueChange_createdAt_idx" ON "ProjectDueChange"("createdAt");

-- AddForeignKey
ALTER TABLE "ProjectDueChange" ADD CONSTRAINT "ProjectDueChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDueChange" ADD CONSTRAINT "ProjectDueChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

