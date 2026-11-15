import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { EventBus } from '../src/events/event-bus.js';
import { OutboxDispatcher } from '../src/events/outbox.dispatcher.js';
import type { Event } from '../src/generated/prisma/client.js';

type Who = 'lead' | 'mentor' | 'guest' | 'outsider';

describe('Tasklar, izohlar va outbox (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = `T${run}`;
  const username = (who: Who) => `e2e_${who}_${run.toLowerCase()}`;
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;
  let statuses: Record<string, string>;
  let task1: string;
  const delivered: Event[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
  const tasksUrl = () => `/api/v1/projects/${projectId}/tasks`;
  const events = (type: string, entityId = task1) => prisma.event.findMany({ where: { entityId, type }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });

    for (const who of ['lead', 'mentor', 'guest', 'outsider'] as Who[]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who}`, telegramUsername: username(who) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: memberRole.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }

    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key, name: 'Task e2e' }).expect(201);
    projectId = project.body.id;
    statuses = Object.fromEntries(project.body.statuses.map((s: { name: string; id: string }) => [s.name, s.id]));
    for (const [who, role] of [['mentor', 'developer'], ['guest', 'guest']] as const) {
      await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users[who].id, role }).expect(201);
    }

    app.get(EventBus).subscribe('*', 'e2e-yig‘uvchi', (e) => {
      if ((e.payload as { projectId?: string }).projectId === projectId || e.entityId === projectId) delivered.push(e);
    });
    app.get(EventBus).subscribe('task.created', 'e2e-buzuq', () => {
      throw new Error('ataylab xato: boshqa obunachilar to‘xtamasligi kerak');
    });
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id);
    // Eventlarga bildirishnomalar bog'langan (NotificationRules): avval ular.
    await prisma.notification.deleteMany({ where: { event: { entityId: { in: [projectId, ...taskIds] } } } });
    await prisma.event.deleteMany({ where: { entityId: { in: [projectId, ...taskIds] } } });
    await prisma.comment.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('task yaratiladi: kalit, Backlog statusi, bajaruvchi va eventlar', async () => {
    const res = await http()
      .post(tasksUrl())
      .set(as('lead'))
      .send({ title: 'Login sahifasi', priority: 'HIGH', dueDate: '2026-11-20', assigneeIds: [users.mentor.id] })
      .expect(201);
    task1 = res.body.id;
    expect(res.body).toMatchObject({
      key: `${key}-1`,
      number: 1,
      priority: 'HIGH',
      status: { name: 'Backlog', category: 'TODO' },
      assignees: [expect.objectContaining({ userId: users.mentor.id })],
      reporter: { userId: users.lead.id },
      completedAt: null,
      comments: [],
    });
    expect(await events('task.created')).toHaveLength(1);
    const [assigned] = await events('task.assigned');
    expect(assigned.payload).toMatchObject({ key: `${key}-1`, assigneeIds: [users.mentor.id], added: [users.mentor.id], removed: [], projectId });

    const second = await http().post(tasksUrl()).set(as('mentor')).send({ title: 'Ikkinchi', statusId: statuses['To do'] }).expect(201);
    expect(second.body).toMatchObject({ key: `${key}-2`, assignees: [], status: { name: 'To do' } });
  });

  it('noto‘g‘ri bajaruvchi yoki status 400; ruxsatsiz yaratish 403; begonaga loyiha 404', async () => {
    await http().post(tasksUrl()).set(as('lead')).send({ title: 'X', assigneeIds: [users.outsider.id] }).expect(400);
    await http().post(tasksUrl()).set(as('lead')).send({ title: 'X', statusId: 'yoq' }).expect(400);
    await http().post(tasksUrl()).set(as('lead')).send({ title: '' }).expect(400);
    await http().post(tasksUrl()).set(as('guest')).send({ title: 'Mehmon' }).expect(403);
    await http().get(tasksUrl()).set(as('outsider')).expect(404);
    await http().post(tasksUrl()).set(as('lead')).send({ title: 'Done bilan', statusId: statuses.Done }).expect(201);
  });

  it('ro‘yxat filtrlari, raqam bo‘yicha olish va mening tasklarim', async () => {
    const mine = await http().get(`${tasksUrl()}?assignee=me`).set(as('mentor')).expect(200);
    expect(mine.body.map((t: { id: string }) => t.id)).toEqual([task1]);
    const all = await http().get(tasksUrl()).set(as('lead')).expect(200);
    expect(all.body.map((t: { number: number }) => t.number)).toEqual([3, 2, 1]);

    await http().get(`${tasksUrl()}/1`).set(as('mentor')).expect(200);
    // Mijoz (guest) boardni ko'rmaydi: faqat "Mijoz bilan" chat.
    await http().get(tasksUrl()).set(as('guest')).expect(403);
    await http().get(`${tasksUrl()}/1`).set(as('guest')).expect(403);
    await http().get(`${tasksUrl()}/999`).set(as('lead')).expect(404);

    const myTasks = await http().get('/api/v1/tasks/mine').set(as('mentor')).expect(200);
    expect(myTasks.body.map((t: { key: string }) => t.key)).toEqual([`${key}-1`]);
  });

  it('mentor Review gacha olib boradi, Done uchun task.close kerak', async () => {
    const move = (who: Who, status: string) => http().patch(`${tasksUrl()}/${task1}`).set(as(who)).send({ statusId: statuses[status] });
    await move('mentor', 'In progress').expect(200);
    await move('mentor', 'Review').expect(200);
    const denied = await move('mentor', 'Done').expect(403);
    expect(denied.body.message).toContain('task.close');

    const done = await move('lead', 'Done').expect(200);
    expect(done.body.completedAt).not.toBeNull();
    const open = await http().get('/api/v1/tasks/mine').set(as('mentor')).expect(200);
    expect(open.body).toEqual([]);
    const withClosed = await http().get('/api/v1/tasks/mine?all=true').set(as('mentor')).expect(200);
    expect(withClosed.body).toHaveLength(1);

    await move('mentor', 'In progress').expect(403);
    const reopened = await move('lead', 'In progress').expect(200);
    expect(reopened.body.completedAt).toBeNull();

    const changes = (await events('task.status_changed')).map((e) => (e.payload as { to: { name: string } }).to.name);
    expect(changes).toEqual(['In progress', 'Review', 'Done', 'In progress']);
  });

  it('tahrirlash va qayta tayinlash; mehmon tahrirlay olmaydi', async () => {
    const res = await http()
      .patch(`${tasksUrl()}/${task1}`)
      .set(as('mentor'))
      .send({ title: 'Login sahifasi (v2)', dueDate: null, assigneeIds: [users.lead.id] })
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Login sahifasi (v2)', dueDate: null, assignees: [expect.objectContaining({ userId: users.lead.id })] });
    const assigned = await events('task.assigned');
    expect(assigned.at(-1)?.payload).toMatchObject({ assigneeIds: [users.lead.id], added: [users.lead.id], removed: [users.mentor.id] });
    expect((await events('task.updated')).at(-1)?.payload).toMatchObject({ fields: ['title', 'dueDate'] });

    await http().patch(`${tasksUrl()}/${task1}`).set(as('guest')).send({ title: 'Mehmon' }).expect(403);
    await http().patch(`${tasksUrl()}/${task1}`).set(as('lead')).send({ assigneeIds: [users.outsider.id] }).expect(400);
    await http().patch(`${tasksUrl()}/${task1}`).set(as('lead')).send({}).expect(400);
  });

  it('izoh: faqat loyiha a’zolari mention qilinadi, o‘zini mention qilsa event yo‘q', async () => {
    const body = `@${username('mentor').toUpperCase()} va @${username('outsider')} qarang, @${username('lead')} ham`;
    const res = await http().post(`${tasksUrl()}/${task1}/comments`).set(as('lead')).send({ body }).expect(201);
    expect(res.body.mentions).toEqual(expect.arrayContaining([users.mentor.id, users.lead.id]));
    expect(res.body.mentions).not.toContain(users.outsider.id);

    expect(await events('task.commented')).toHaveLength(1);
    const mentioned = await events('task.mentioned');
    expect(mentioned.map((e) => (e.payload as { userId: string }).userId)).toEqual([users.mentor.id]);

    await http().post(`${tasksUrl()}/${task1}/comments`).set(as('guest')).send({ body: 'salom' }).expect(403);
    const detail = await http().get(`${tasksUrl()}/1`).set(as('mentor')).expect(200);
    expect(detail.body.comments).toEqual([expect.objectContaining({ body, author: expect.objectContaining({ userId: users.lead.id }) })]);
  });

  it('outbox: drain eventlarni obunachilarga yetkazadi, buzuq obunachi to‘xtatmaydi', async () => {
    const dispatcher = app.get(OutboxDispatcher);
    expect(await dispatcher.drain()).toBeGreaterThan(0);
    const types = new Set(delivered.map((e) => e.type));
    for (const type of ['project.created', 'task.created', 'task.assigned', 'task.status_changed', 'task.commented', 'task.mentioned']) {
      expect(types).toContain(type);
    }
    const pending = await prisma.event.count({ where: { publishedAt: null, entityId: { in: [projectId, task1] } } });
    expect(pending).toBe(0);
    expect(await dispatcher.drain()).toBe(0);
  });

  it('bir nechta mas’ul: ikkalasi ham javobgar, ikkalasining tasklari ro‘yxatida', async () => {
    const res = await http()
      .post(tasksUrl())
      .set(as('lead'))
      .send({ title: 'Juft ish', assigneeIds: [users.mentor.id, users.lead.id] })
      .expect(201);
    expect(res.body.assignees.map((a: { userId: string }) => a.userId).sort()).toEqual([users.mentor.id, users.lead.id].sort());
    const [event] = await events('task.assigned', res.body.id);
    expect((event.payload as { added: string[] }).added.sort()).toEqual([users.mentor.id, users.lead.id].sort());

    for (const who of ['mentor', 'lead'] as Who[]) {
      const mine = await http().get('/api/v1/tasks/mine').set(as(who)).expect(200);
      expect(mine.body.map((t: { id: string }) => t.id)).toContain(res.body.id);
    }
    const filtered = await http().get(`${tasksUrl()}?assignee=me`).set(as('mentor')).expect(200);
    expect(filtered.body.map((t: { id: string }) => t.id)).toContain(res.body.id);

    const one = await http().patch(`${tasksUrl()}/${res.body.id}`).set(as('lead')).send({ assigneeIds: [users.lead.id] }).expect(200);
    expect(one.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([users.lead.id]);
    const none = await http().patch(`${tasksUrl()}/${res.body.id}`).set(as('lead')).send({ assigneeIds: [] }).expect(200);
    expect(none.body.assignees).toEqual([]);
  });

  it('“Men olaman”: egasiz taskni dasturchi oladi, boshqasi qo‘shiladi, chiqib ketadi; mehmon ololmaydi', async () => {
    const free = await http().post(tasksUrl()).set(as('lead')).send({ title: 'Egasiz task' }).expect(201);
    const claim = (who: Who) => http().post(`${tasksUrl()}/${free.body.number}/claim`).set(as(who));

    const taken = await claim('mentor').expect(201);
    expect(taken.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([users.mentor.id]);
    const [event] = await events('task.assigned', free.body.id);
    expect(event).toMatchObject({ actorId: users.mentor.id, payload: expect.objectContaining({ claimed: true, added: [users.mentor.id] }) });

    // ikkinchi marta — o'zgarmaydi; teamlead ham qo'shiladi
    await claim('mentor').expect(201);
    const both = await claim('lead').expect(201);
    expect(both.body.assignees).toHaveLength(2);

    await claim('guest').expect(403);
    await claim('outsider').expect(404);

    const left = await http().delete(`${tasksUrl()}/${free.body.number}/claim`).set(as('mentor')).expect(200);
    expect(left.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([users.lead.id]);
  });

  it('arxivdagi loyihada task yaratib ham, izoh yozib ham bo‘lmaydi', async () => {
    await http().patch(`/api/v1/projects/${projectId}`).set(as('lead')).send({ status: 'ARCHIVED' }).expect(200);
    await http().post(tasksUrl()).set(as('lead')).send({ title: 'Arxivda' }).expect(409);
    await http().post(`${tasksUrl()}/${task1}/comments`).set(as('lead')).send({ body: 'salom' }).expect(409);
    await http().get(`${tasksUrl()}/1`).set(as('lead')).expect(200);
  });
});
