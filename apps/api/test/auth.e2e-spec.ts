import { createHash, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { createInviteRecord } from '../src/invites/invite-record.js';
import { InviteError, InvitesService } from '../src/invites/invites.service.js';

const BOT_TOKEN = '123456:E2E_TEST_TOKEN';

function signedWidget(tgId: number, firstName: string) {
  const data: Record<string, string | number> = {
    id: tgId,
    first_name: firstName,
    auth_date: Math.floor(Date.now() / 1000),
  };
  const dcs = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return { ...data, hash: createHmac('sha256', secret).update(dcs).digest('hex') };
}

function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('lp_refresh='));
  if (!cookie) throw new Error('refresh cookie yo‘q');
  return cookie.split(';')[0];
}

describe('Auth va takliflar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let invites: InvitesService;
  let workspaceId: string;
  // Haqiqiy Telegram ID'lar bilan to'qnashmaslik uchun katta tasodifiy son.
  const base = 9_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const ids = { member: base + 1, admin: base + 2, stranger: base + 3 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    invites = app.get(InvitesService);
    workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
  });

  afterAll(async () => {
    const tgIds = Object.values(ids).map(BigInt);
    const users = await prisma.user.findMany({ where: { telegramId: { in: tgIds } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    await prisma.invite.deleteMany({
      where: { OR: [{ usedById: { in: userIds } }, { createdById: { in: userIds } }, { note: 'e2e' }] },
    });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('himoyalangan endpoint tokensiz 401', async () => {
    await http().get('/api/v1/auth/me').expect(401);
  });

  it('taklif qilinmagan odam kira olmaydi (403)', async () => {
    await http().post('/api/v1/auth/telegram/widget').send(signedWidget(ids.stranger, 'Begona')).expect(403);
  });

  it('soxta imzo 401', async () => {
    const data = { ...signedWidget(ids.member, 'Aziz'), first_name: 'Boshqa' };
    await http().post('/api/v1/auth/telegram/widget').send(data).expect(401);
  });

  it('dev-login test muhitida yopiq (404)', async () => {
    await http().post('/api/v1/auth/dev-login').send({ telegramId: ids.member }).expect(404);
  });

  it('taklif → login → me → refresh rotatsiyasi → logout', async () => {
    const invite = await createInviteRecord(prisma, { workspaceId, roleName: 'member', note: 'e2e' });
    const tgUser = { id: ids.member, first_name: 'Aziz', username: 'aziz_e2e' };
    await expect(invites.accept(invite.token, tgUser)).resolves.toMatchObject({ role: 'member' });
    // Bir martalik.
    await expect(invites.accept(invite.token, tgUser)).rejects.toBeInstanceOf(InviteError);

    // A'zo boshqa (masalan, admin) havolani ochsa — roli o'zgarmaydi, havola egasi uchun ochiq qoladi.
    const adminLink = await createInviteRecord(prisma, { workspaceId, roleName: 'admin', note: 'boshqa odam uchun' });
    await expect(invites.accept(adminLink.token, tgUser)).rejects.toMatchObject({ code: 'already_member' });
    const still = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId, user: { telegramId: BigInt(ids.member) } }, include: { role: true } });
    expect(still.role.name).toBe('member');
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: adminLink.id } })).usedAt).toBeNull();
    await prisma.invite.delete({ where: { id: adminLink.id } });

    const login = await http().post('/api/v1/auth/telegram/widget').send(signedWidget(ids.member, 'Aziz')).expect(200);
    const access = login.body.accessToken as string;
    const cookie1 = refreshCookie(login);

    const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`).expect(200);
    expect(me.body).toMatchObject({ name: 'Aziz', workspaces: [{ slug: 'itlive', role: 'member' }] });

    const refreshed = await http().post('/api/v1/auth/refresh').set('Cookie', cookie1).expect(200);
    const cookie2 = refreshCookie(refreshed);
    expect(cookie2).not.toBe(cookie1);

    // Eski token qayta ishlatildi → hamma sessiyalar yopiladi.
    await http().post('/api/v1/auth/refresh').set('Cookie', cookie1).expect(401);
    await http().post('/api/v1/auth/refresh').set('Cookie', cookie2).expect(401);

    await http().post('/api/v1/auth/logout').set('Cookie', cookie2).expect(204);
  });

  it('member taklif yarata olmaydi, admin esa owner taklifini yarata olmaydi', async () => {
    const memberLogin = await http().post('/api/v1/auth/telegram/widget').send(signedWidget(ids.member, 'Aziz')).expect(200);
    await http()
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .send({ role: 'member' })
      .expect(403);

    const adminInvite = await createInviteRecord(prisma, { workspaceId, roleName: 'admin', note: 'e2e' });
    await invites.accept(adminInvite.token, { id: ids.admin, first_name: 'Admin' });
    const adminLogin = await http().post('/api/v1/auth/telegram/widget').send(signedWidget(ids.admin, 'Admin')).expect(200);
    const auth = `Bearer ${adminLogin.body.accessToken}`;

    const created = await http().post('/api/v1/invites').set('Authorization', auth).send({ role: 'member', note: 'e2e' }).expect(201);
    expect(created.body.link).toMatch(/^https:\/\/t\.me\/liveportal_test_bot\?start=inv_/);

    // Admin'da `workspace.owner` yo'q → owner taklifi taqiqlangan. teamlead esa workspace roli emas.
    await http().post('/api/v1/invites').set('Authorization', auth).send({ role: 'owner' }).expect(403);
    await http().post('/api/v1/invites').set('Authorization', auth).send({ role: 'teamlead' }).expect(403);
  });
});
