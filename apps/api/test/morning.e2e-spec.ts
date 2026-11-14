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
import { DeadlineJob } from '../src/scheduler/deadline.job.js';
import { MorningJob } from '../src/scheduler/morning.job.js';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';
import { addDays, localDay } from '../src/tasks/due.js';

type Who = 'lead' | 'mentor' | 'quiet';

class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  async send(chatId: string, message: RenderedMessage) {
    this.sent.push({ chatId, message });
  }
}

describe('Ertalabki ish: kechikkanlar va xulosa (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = `M${run}`;
  const base = 9_200_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const tg: Record<Who, number> = { lead: base + 1, mentor: base + 2, quiet: base + 3 };
  const users = {} as Record<Who, { id: string; token: string }>;
  const now = new Date();
  const today = localDay(now);
  const tomorrowNow = new Date(now.getTime() + 86_400_000);
  const farPeriod = '2031-01-01';
  let projectId: string;
  let statuses: Record<string, string>;
  const taskIds: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };
  const take = () => telegram.sent.splice(0);
  const clearRuns = () =>
    prisma.jobRun.deleteMany({ where: { job: 'morning', period: { in: [today, localDay(tomorrowNow), farPeriod] } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TelegramGateway).useValue(telegram).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });
    for (const who of ['lead', 'mentor', 'quiet'] as Who[]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who}`, telegramId: BigInt(tg[who]) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: memberRole.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    await clearRuns();

    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key, name: 'Ertalab e2e' }).expect(201);
    projectId = project.body.id;
    statuses = Object.fromEntries(project.body.statuses.map((s: { name: string; id: string }) => [s.name, s.id]));
    for (const who of ['mentor', 'quiet'] as Who[]) {
      await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users[who].id }).expect(201);
    }
    const create = async (name: string, who: Who, dueOffset: number | null, statusId?: string) => {
      const body: Record<string, unknown> = { title: name, assigneeIds: [users[who].id] };
      if (dueOffset !== null) body.dueDate = addDays(today, dueOffset);
      if (statusId) body.statusId = statusId;
      const res = await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send(body).expect(201);
      taskIds[name] = res.body.id;
    };
    await create('Kechikkan', 'mentor', -2);
    await create('Bugungi', 'mentor', 0);
    await create('Ertangi', 'mentor', 1);
    await create('Keyingi', 'mentor', 10);
    await create('Yopilgan', 'mentor', -3, statuses.Done);
    await create('Uzoq', 'quiet', 10);
    await flush();
    take(); // yaratishdagi "task berdi" xabarlari bu testga tegishli emas
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    // Loyihadagi hamma tasklar (testlarda yaratilgan soatlilar ham) va foydalanuvchilarga borgan barcha xabarlar.
    const ids = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id);
    const events = await prisma.event.findMany({ where: { OR: [{ entityId: { in: [projectId, ...ids, ...userIds] } }] }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await clearRuns();
    await app.close();
  });

  it('bajaruvchiga xulosa va "taskingiz muddati o‘tdi", teamlead’ga "muddati o‘tdi"; yopilgan va uzoq tasklar e’tiborsiz', async () => {
    const result = await app.get(MorningJob).run(now);
    expect(result).toMatchObject({ ran: true, period: today, overdue: 1, digests: 1 });
    await flush();
    const sent = take();
    const to = (who: Who) => sent.filter((s) => s.chatId === String(tg[who])).map((s) => s.message.text);

    expect(sent).toHaveLength(3);
    expect(to('quiet')).toEqual([]);
    const digest = to('mentor').find((t) => t.includes('Xayrli tong'))!;
    expect(to('mentor').find((t) => t.includes('Taskingiz muddati o‘tdi'))).toContain(`<b>${key}-1</b> · Kechikkan`);
    expect(digest).toContain('☀️ <b>Xayrli tong!</b>');
    expect(digest).toContain(`🔴 Muddati o‘tgan (1)\n• <b>${key}-1</b> Kechikkan`);
    expect(digest).toContain(`🟠 Bugun (1)\n• <b>${key}-2</b> Bugungi`);
    expect(digest).toContain(`🟡 Ertaga (1)\n• <b>${key}-3</b> Ertangi`);
    expect(digest).toContain('Yana 1 ta ochiq task: /mytasks');
    expect(digest).not.toContain('Yopilgan');

    const [overdue] = to('lead');
    expect(overdue).toContain('⏰ Muddati o‘tdi');
    expect(overdue).toContain(`<b>${key}-1</b> · Kechikkan`);
    expect(overdue).toContain('Bajaruvchi: E2E mentor');
  });

  it('shu kuni ikkinchi marta ishlamaydi', async () => {
    await expect(app.get(MorningJob).run(now)).resolves.toMatchObject({ ran: false });
    await flush();
    expect(take()).toEqual([]);
  });

  it('ertasi kuni: faqat yangi kechikkan uchun overdue; tasklar yopilgan bo‘lsa xulosa yuborilmaydi', async () => {
    const result = await app.get(MorningJob).run(tomorrowNow);
    expect(result).toMatchObject({ ran: true, overdue: 1, digests: 1 });
    const overdueEvents = await prisma.event.findMany({ where: { type: 'task.overdue', entityId: { in: Object.values(taskIds) } } });
    expect(overdueEvents.map((e) => e.entityId).sort()).toEqual([taskIds.Kechikkan, taskIds.Bugungi].sort());

    // Xabarlar yuborilishidan oldin mentor hamma tasklarini yopdi: eskirgan xabarlar ketmaydi.
    await prisma.task.updateMany({ where: { assignees: { some: { userId: users.mentor.id } } }, data: { statusId: statuses.Done } });
    await flush();
    expect(take()).toEqual([]);
    const skipped = await prisma.notification.count({ where: { kind: 'overdue', status: 'skipped', event: { entityId: taskIds.Bugungi } } });
    expect(skipped).toBe(2);
    const digest = await prisma.notification.findFirstOrThrow({
      where: { userId: users.mentor.id, kind: 'digest', status: 'skipped' },
    });
    expect(digest.attempts).toBe(1);
  });

  it('rejalashtiruvchi Toshkent vaqti bilan soat 9 dan oldin ishlamaydi', async () => {
    const scheduler = app.get(SchedulerService);
    await scheduler.tick(new Date('2031-01-01T03:59:00Z')); // 08:59 Toshkent
    expect(await prisma.jobRun.count({ where: { period: farPeriod } })).toBe(0);
    await scheduler.tick(new Date('2031-01-01T04:00:00Z')); // 09:00
    expect(await prisma.jobRun.count({ where: { period: farPeriod } })).toBe(1);
  });

  it('soatli muddat: daqiqa o‘tishi bilan bajaruvchi, muallif va teamlead’ga, bir marta', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(as('lead'))
      .send({ title: 'Soatli', assigneeIds: [users.quiet.id], dueDate: today, dueTime: '00:00' })
      .expect(201);
    expect(res.body).toMatchObject({ dueTime: '00:00' });
    await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'Ertaga soatli', assigneeIds: [users.quiet.id], dueDate: addDays(today, 1), dueTime: '00:00' }).expect(201);
    await flush();
    take();

    const jobs = app.get(DeadlineJob);
    expect(await jobs.run(now)).toBe(1);
    expect(await jobs.run(now)).toBe(0);
    await flush();
    const sent = take();
    const quiet = sent.find((s) => s.chatId === String(tg.quiet))!;
    expect(quiet.message.text).toContain('⏰ Taskingiz muddati o‘tdi');
    expect(quiet.message.text).toContain(`📅 Muddat edi: ${today.split('-').reverse().join('.')} 00:00`);
    expect(quiet.message.buttons[0]).toEqual([
      { text: '▶️ Boshladim', callbackData: `ts:${res.body.id}:start` },
      { text: '👀 Review’ga', callbackData: `ts:${res.body.id}:review` },
    ]);
    expect(sent.some((s) => s.chatId === String(tg.lead) && s.message.text.includes('Bajaruvchi: E2E quiet'))).toBe(true);
    taskIds.Soatli = res.body.id;
  });

  it('soat faqat sana bilan; sana olib tashlansa, soat ham ketadi', async () => {
    await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'X', dueTime: '10:00' }).expect(400);
    await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'X', dueDate: today, dueTime: '25:00' }).expect(400);
    const cleared = await http().patch(`/api/v1/projects/${projectId}/tasks/${taskIds.Soatli}`).set(as('lead')).send({ dueDate: null }).expect(200);
    expect(cleared.body).toMatchObject({ dueDate: null, dueTime: null });
  });
});
