-- CreateTable
CREATE TABLE "JobRun" (
    "job" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("job","period")
);

