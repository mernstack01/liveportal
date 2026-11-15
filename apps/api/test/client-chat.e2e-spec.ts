import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { OutboxDispatcher } from '../src/events/outbox.dispatcher.js';
import type { RenderedMessage } from '../src/notifications/notification-message.js';
import { NotificationSender } from '../src/notifications/notification.sender.js';
import { TelegramGateway } from '../src/notifications/telegram.gateway.js';

/** lead — teamlead, dev — dasturchi, client — loyihadagi mijoz, stranger — boshqa loyihaning mijozi. */
type Who = 'lead' | 'dev' | 'client' | 'stranger';

class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  async send(chatId: string, message: RenderedMessage) {
    this.sent.push({ chatId, message });
  }
}

describe('Mijoz kanali (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_400_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const tg: Record<Who, number> = { lead: base + 1, dev: base + 2, client: base + 3, stranger: base + 4 };
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;
  const roleIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
  const p = (path = '') => `/api/v1/projects/${projectId}${path}`;
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TelegramGateway).useValue(telegram).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const role = (name: string) => prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name } } });
    const member = await role('member');
    const client = await role('client');
    for (const who of ['lead', 'dev', 'client', 'stranger'] as Who[]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who}`, telegramId: BigInt(tg[who]), telegramUsername: `e2e_${who}_${run.toLowerCase()}` } });
      const wsRole = who === 'client' || who === 'stranger' ? client : member;
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: wsRole.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key: `M${run}`, name: 'Mijoz e2e' }).expect(201);
    projectId = project.body.id;
    await http().post(p('/members')).set(as('lead')).send({ userId: users.dev.id }).expect(201);
    await http().post(p('/members')).set(as('lead')).send({ userId: users.client.id, role: 'guest' }).expect(201);
    await flush();
    telegram.sent.splice(0);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const channels = await prisma.channel.findMany({ where: { projectId }, select: { id: true } });
    const messageIds = (await prisma.message.findMany({ where: { channelId: { in: channels.map((c) => c.id) } }, select: { id: true } })).map((m) => m.id);
    const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } });
    const entityIds = [projectId, ...messageIds, ...tasks.map((t) => t.id)];
    const events = await prisma.event.findMany({ where: { entityId: { in: entityIds } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.attachment.deleteMany({ where: { messageId: { in: messageIds } } });
    await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    await prisma.channel.deleteMany({ where: { projectId } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('mijoz loyihani ko‘radi, lekin board, tasklar, ichki chat va jamoa ro‘yxati yopiq', async () => {
    const project = await http().get(p()).set(as('client')).expect(200);
    expect(project.body.myPermissions).toEqual(expect.arrayContaining(['message.external.read', 'message.external.write']));
    expect(project.body.myPermissions).not.toContain('task.view');
    expect(project.body.members.find((m: { userId: string }) => m.userId === users.client.id)).toMatchObject({ isClient: true });
    expect(project.body.members.find((m: { userId: string }) => m.userId === users.dev.id)).toMatchObject({ isClient: false });

    await http().get(p('/tasks')).set(as('client')).expect(403);
    await http().post(p('/tasks')).set(as('client')).send({ title: 'Mijoz task' }).expect(403);
    await http().get(p('/chat')).set(as('client')).expect(403);
    await http().get('/api/v1/workspace/members').set(as('client')).expect(403);
    await http().get('/api/v1/workspace/members').set(as('dev')).expect(200);

    const list = await http().get('/api/v1/projects').set(as('client')).expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([projectId]);
    await http().get(p()).set(as('stranger')).expect(404);
    await http().get(p('/client-chat')).set(as('stranger')).expect(404);
  });

  it('mijoz yozsa teamlead’ga Telegram xabari boradi, dasturchiga emas', async () => {
    await http().post(p('/client-chat')).set(as('client')).send({ body: 'Assalomu alaykum, to‘lov sahifasi qachon tayyor?' }).expect(201);
    await flush();
    const sent = telegram.sent.splice(0);
    expect(sent.map((s) => s.chatId)).toEqual([String(tg.lead)]);
    expect(sent[0].message.text).toContain('<b>Mijoz e2e</b> · mijoz chati');
    expect(sent[0].message.text).toContain('E2E client yozdi');
    expect(sent[0].message.text).toContain('to‘lov sahifasi');

    // Dasturchi mijoz chatini ko'rmaydi (developer rolida message.external.* yo'q).
    await http().get(p('/client-chat')).set(as('dev')).expect(403);
  });

  it('teamlead javob bersa mijozga boradi; ikkalasi ham xabarlarni ko‘radi', async () => {
    await http().post(p('/client-chat')).set(as('lead')).send({ body: 'Juma kuni tayyor bo‘ladi.' }).expect(201);
    await flush();
    const sent = telegram.sent.splice(0);
    expect(sent.map((s) => s.chatId)).toEqual([String(tg.client)]);
    expect(sent[0].message.text).toContain('Juma kuni');

    for (const who of ['client', 'lead'] as Who[]) {
      const res = await http().get(p('/client-chat')).set(as(who)).expect(200);
      expect(res.body.canWrite).toBe(true);
      expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual([expect.stringContaining('to‘lov'), 'Juma kuni tayyor bo‘ladi.']);
    }
  });

  it('mijozga task berib bo‘lmaydi', async () => {
    await http().post(p('/tasks')).set(as('lead')).send({ title: 'Mijozga task', assigneeIds: [users.client.id] }).expect(400);
    await http().post(p('/tasks')).set(as('lead')).send({ title: 'Dasturchiga task', assigneeIds: [users.dev.id] }).expect(201);
  });

  it('task ruxsati bor yangi rol boardni ham ko‘radi (task.view avtomatik)', async () => {
    const res = await http()
      .post('/api/v1/roles')
      .set(as('lead'))
      .send({ title: `Tester ${run}`, permissions: ['task.comment'] })
      .expect(201);
    roleIds.push(res.body.id);
    expect(res.body.permissions).toEqual(expect.arrayContaining(['task.comment', 'task.view']));
  });
});
