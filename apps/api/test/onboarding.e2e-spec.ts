import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { TelegramGateway } from '../src/notifications/telegram.gateway.js';

/** Yo'riqnoma (walkthrough): ko'rilgani serverda — boshqa qurilmada qayta chiqmasin. */
describe('Onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;
  let token: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramGateway)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const member = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });
    const user = await prisma.user.create({ data: { name: 'E2E onboarding', telegramId: BigInt(9_800_000_000 + Math.floor(Math.random() * 1_000_000)) } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: member.id } });
    userId = user.id;
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });

  afterAll(async () => {
    await prisma.workspaceMember.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('yangi odamda bo‘sh; belgilanadi, takrori bitta; noto‘g‘ri nom 400; tokensiz 401', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    expect((await http().get('/api/v1/auth/me').set(auth).expect(200)).body.onboarding).toEqual([]);
    await http().post('/api/v1/auth/me/onboarding').set(auth).send({ tour: 'welcome' }).expect(204);
    await http().post('/api/v1/auth/me/onboarding').set(auth).send({ tour: 'welcome' }).expect(204);
    await http().post('/api/v1/auth/me/onboarding').set(auth).send({ tour: 'project' }).expect(204);
    expect((await http().get('/api/v1/auth/me').set(auth).expect(200)).body.onboarding).toEqual(['welcome', 'project']);
    await http().post('/api/v1/auth/me/onboarding').set(auth).send({ tour: 'Bad Name!' }).expect(400);
    await http().post('/api/v1/auth/me/onboarding').send({ tour: 'welcome' }).expect(401);
  });
});
