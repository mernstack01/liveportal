import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import type { Env } from '../config/env.js';
import { uploadOptions } from '../files/uploads.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { DealPaymentsService } from './deal-payments.service.js';
import { DealStartService } from './deal-start.service.js';
import { DealsSummaryService } from './deals-summary.service.js';
import { DealsController } from './deals.controller.js';
import { DealsService } from './deals.service.js';

@Module({
  imports: [AuthModule, ProjectsModule, MulterModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => uploadOptions(config) })],
  controllers: [DealsController],
  providers: [DealsService, DealPaymentsService, DealStartService, DealsSummaryService],
  exports: [DealsService, DealPaymentsService],
})
export class DealsModule {}
