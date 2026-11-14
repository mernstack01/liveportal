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
import { TelegramGateway, TelegramPermanentError } from '../src/notifications/telegram.gateway.js';
import { TaskActionError, TaskActionsService } from '../src/tasks/task-actions.service.js';

type Who = 'lead' | 'mentor' | 'helper' | 'offline';

/** Haqiqiy Telegram o'rniga: yuborilgan xabarlarni yig'adi, kerak bo'lsa xato beradi. */
class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  failNext: Error | null = null;
  async send(chatId: string, message: RenderedMessage) {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.sent.push({ chatId, message });
  }
}

describe('Telegram bildirishnomalari (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = `N${run}`;
  const base = 9_100_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const tg: Record<Who, number | null> = { lead: base + 1, mentor: base + 2, helper: base + 3, offline: null };
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;
  let taskId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
  /** Outbox → qoidalar → navbat → yuborish. */
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };
  const take = () => telegram.sent.splice(0);
  const chat = (who: Who) => String(tg[who]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramGateway)
      .useValue(telegram)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });

    for (const who of ['lead', 'mentor', 'helper', 'offline'] as Who[]) {
      const user = await prisma.user.create({
        data: { name: `E2E ${who}`, telegramId: tg[who] === null ? null : BigInt(tg[who]), telegramUsername: `e2e_${who}_${run.toLowerCase()}` },
      });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: memberRole.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    // Avvalgi test fayllaridan qolgan eventlar bu testga aralashmasin.
    await flush();
    take();

    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key, name: 'Bildirishnoma e2e' }).expect(201);
    projectId = project.body.id;
    for (const who of ['mentor', 'helper', 'offline'] as Who[]) {
      await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users[who].id }).expect(201);
    }
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id);
    const eventIds = (await prisma.event.findMany({ where: { entityId: { in: [projectId, ...taskIds] } }, select: { id: true } })).map((e) => e.id);
    await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.comment.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('loyihaga qo‘shilganlarga xabar; Telegram’siz odam "failed" bo‘ladi, yaratuvchiga xabar yo‘q', async () => {
    await flush();
    const sent = take();
    expect(sent.map((s) => s.chatId).sort()).toEqual([chat('mentor'), chat('helper')].sort());
    expect(sent[0].message.text).toContain('loyihasiga qo‘shdi');
    const offline = await prisma.notification.findFirstOrThrow({ where: { userId: users.offline.id } });
    expect(offline).toMatchObject({ status: 'failed', lastError: 'Foydalanuvchi Telegram’ga ulanmagan' });
  });

  it('task berilganda bajaruvchiga Boshladim va Review’ga tugmalari bilan xabar', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(as('lead'))
      .send({ title: 'Login <sahifasi>', assigneeIds: [users.mentor.id], priority: 'URGENT', dueDate: '2026-11-20' })
      .expect(201);
    taskId = res.body.id;
    await flush();
    const [msg, ...rest] = take();
    expect(rest).toEqual([]);
    expect(msg.chatId).toBe(chat('mentor'));
    expect(msg.message.text).toContain(`<b>${key}-1</b> · Login &lt;sahifasi&gt;`);
    expect(msg.message.text).toContain('⏰ Muddat: 20.11.2026');
    expect(msg.message.buttons).toEqual([
      [
        { text: '▶️ Boshladim', callbackData: `ts:${taskId}:start` },
        { text: '👀 Review’ga', callbackData: `ts:${taskId}:review` },
      ],
    ]);
  });

  it('“Men olaman”: muallif (teamlead)ga “taskni oldi” xabari, ikki mas’ulning ikkalasiga “task berdi”', async () => {
    const free = await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'Egasiz' }).expect(201);
    await http().post(`/api/v1/projects/${projectId}/tasks/${free.body.number}/claim`).set(as('helper')).expect(201);
    await flush();
    const claimed = take();
    expect(claimed.map((s) => s.chatId)).toEqual([chat('lead')]);
    expect(claimed[0].message.text).toContain('🙋 E2E helper taskni oldi');

    await http()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(as('lead'))
      .send({ title: 'Ikkalasiga', assigneeIds: [users.mentor.id, users.helper.id] })
      .expect(201);
    await flush();
    const both = take();
    expect(both.map((s) => s.chatId).sort()).toEqual([chat('mentor'), chat('helper')].sort());
    expect(both.every((s) => s.message.buttons[0]?.[0]?.text === '▶️ Boshladim')).toBe(true);
  });

  it('o‘ziga task bergan odamga xabar bormaydi', async () => {
    await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'O‘zim', assigneeIds: [users.lead.id] }).expect(201);
    await flush();
    expect(take()).toEqual([]);
  });

  it('izoh: mention qilingan "belgiladi", bajaruvchi "izoh yozdi" oladi, muallif o‘zi olmaydi', async () => {
    await http()
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/comments`)
      .set(as('lead'))
      .send({ body: `@e2e_helper_${run.toLowerCase()} yordam bering` })
      .expect(201);
    await flush();
    const sent = take();
    const byChat = Object.fromEntries(sent.map((s) => [s.chatId, s.message.text]));
    expect(Object.keys(byChat).sort()).toEqual([chat('mentor'), chat('helper')].sort());
    expect(byChat[chat('helper')]).toContain('sizni izohda belgiladi');
    expect(byChat[chat('mentor')]).toContain('izoh yozdi');
    expect(byChat[chat('mentor')]).toContain('<blockquote>');
  });

  it('bajaruvchi izohda mention qilinsa, bitta xabar oladi (belgiladi)', async () => {
    await http()
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/comments`)
      .set(as('lead'))
      .send({ body: `@e2e_mentor_${run.toLowerCase()} qarang` })
      .expect(201);
    await flush();
    const sent = take();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ chatId: chat('mentor') });
    expect(sent[0].message.text).toContain('belgiladi');
  });

  it('Telegram tugmasi: Boshladim → In progress, Review’ga → teamlead’ga xabar', async () => {
    const actions = app.get(TaskActionsService);
    await expect(actions.apply(tg.mentor!, taskId, 'start')).resolves.toBe(`${key}-1 → «In progress» ✅`);
    await expect(actions.apply(tg.mentor!, taskId, 'start')).resolves.toContain('allaqachon');
    await expect(actions.apply(tg.mentor!, taskId, 'review')).resolves.toContain('«Review»');

    await flush();
    const sent = take();
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(chat('lead'));
    expect(sent[0].message.text).toContain('Review’ga o‘tdi');
    expect(sent[0].message.text).toContain('Bajaruvchi: E2E mentor');

    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { status: true } });
    expect(task.status.name).toBe('Review');
  });

  it('Telegram tugmasi ruxsatni tekshiradi: begona va noma’lum odam rad etiladi', async () => {
    const actions = app.get(TaskActionsService);
    await expect(actions.apply(999_999_999_999, taskId, 'start')).rejects.toThrow(TaskActionError);
    const outsider = await prisma.user.create({ data: { name: 'Begona', telegramId: BigInt(base + 9) } });
    try {
      await expect(actions.apply(base + 9, taskId, 'start')).rejects.toThrow('Siz workspace a’zosi emassiz');
    } finally {
      await prisma.user.delete({ where: { id: outsider.id } });
    }
  });

  it('vaqtinchalik xato: qayta urinish rejalashtiriladi; doimiy xato: failed', async () => {
    await http().patch(`/api/v1/projects/${projectId}/tasks/${taskId}`).set(as('lead')).send({ assigneeIds: [users.helper.id] }).expect(200);
    await app.get(OutboxDispatcher).drain();
    telegram.failNext = new Error('ECONNRESET');
    await app.get(NotificationSender).drain();
    const pending = await prisma.notification.findFirstOrThrow({ where: { userId: users.helper.id, kind: 'assigned' } });
    expect(pending).toMatchObject({ status: 'pending', attempts: 1, lastError: 'ECONNRESET' });
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Muddatni o'tkazib yuboramiz: endi doimiy xato (bot bloklangan).
    await prisma.notification.update({ where: { id: pending.id }, data: { nextAttemptAt: new Date() } });
    telegram.failNext = new TelegramPermanentError('Forbidden: bot was blocked by the user');
    await app.get(NotificationSender).drain();
    const failed = await prisma.notification.findUniqueOrThrow({ where: { id: pending.id } });
    expect(failed).toMatchObject({ status: 'failed', attempts: 2 });
    expect(take()).toEqual([]);
  });
});
