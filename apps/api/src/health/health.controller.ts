import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../db/prisma.service.js';

export interface HealthStatus {
  status: 'ok';
  service: 'liveportal-api';
  time: string;
}

export interface ReadinessStatus extends HealthStatus {
  checks: { database: 'up' };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Jarayon tirikmi (liveness). Tashqi servislarga bog'liq emas. */
  @Get()
  check(): HealthStatus {
    return { status: 'ok', service: 'liveportal-api', time: new Date().toISOString() };
  }

  /** So'rovlarni qabul qilishga tayyormi (readiness): baza ulanishi tekshiriladi. */
  @Get('ready')
  async ready(): Promise<ReadinessStatus> {
    if (!(await this.prisma.ping())) {
      throw new ServiceUnavailableException({ status: 'error', checks: { database: 'down' } });
    }
    return { ...this.check(), checks: { database: 'up' } };
  }
}
