-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ma'l umot: mavjud yagona mas'ullar yangi jadvalga ko'chiriladi (assigneeId keyingi migrationda olib tashlanadi).
INSERT INTO "TaskAssignee" ("taskId", "userId", "createdAt")
SELECT "id", "assigneeId", "createdAt" FROM "Task" WHERE "assigneeId" IS NOT NULL;
