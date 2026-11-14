import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../db/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const prisma = { ping: vi.fn<() => Promise<boolean>>() };

  beforeEach(async () => {
    prisma.ping.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok status with ISO timestamp', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('liveportal-api');
    expect(new Date(result.time).toISOString()).toBe(result.time);
  });

  it('reports ready when the database answers', async () => {
    prisma.ping.mockResolvedValue(true);
    await expect(controller.ready()).resolves.toMatchObject({ checks: { database: 'up' } });
  });

  it('returns 503 when the database is down', async () => {
    prisma.ping.mockResolvedValue(false);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
