import { Module } from '@nestjs/common';
import { MorningJob } from './morning.job.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [MorningJob, SchedulerService],
  exports: [MorningJob, SchedulerService],
})
export class SchedulerModule {}
