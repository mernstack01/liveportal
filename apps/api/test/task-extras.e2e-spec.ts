import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { TelegramGateway } from '../src/notifications/telegram.gateway.js';

/** Jira'dagidek: task turi, kichik vazifalar (subtask) va tarix. */
type Who = 'lead' | 'dev';

describe('Task turi, kichik vazifalar va tarix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_600_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const users = {} as Record<Who, { id: string; token: string }>;
  const projectIds: string[] = [];
  let statuses: Record<string, string>;
  let parent: { id: string; number: number };

  const http = () => request(app.getHttpServer());
  const as = (w: Who) => ({ Authorization: `Bearer ${users[w].token}` });
  const tasks = (path = '', projectId = projectIds[0]) => `/api/v1/projects/${projectId}/tasks${path}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramGateway)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const member = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });
    for (const [i, w] of (['lead', 'dev'] as Who[]).entries()) {
      const user = await prisma.user.create({ data: { name: `E2E ${w}`, telegramId: BigInt(base + i + 1) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: member.id } });
      users[w] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    for (const key of [`J${run}`, `K${run}`]) {
      const project = await http().post('/api/v1/projects').set(as('lead')).send({ key, name: `Jira ${key}` }).expect(201);
      projectIds.push(project.body.id);
    }
    await http().post(`/api/v1/projects/${projectIds[0]}/members`).set(as('lead')).send({ userId: users.dev.id }).expect(201);
    const detail = await http().get(`/api/v1/projects/${projectIds[0]}`).set(as('lead')).expect(200);
    statuses = Object.fromEntries(detail.body.statuses.map((s: { name: string; id: string }) => [s.name, s.id]));
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((t) => t.id);
    const events = await prisma.event.findMany({ where: { entityId: { in: [...projectIds, ...taskIds] } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.comment.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.updateMany({ where: { projectId: { in: projectIds } }, data: { parentId: null } });
    await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.workflowStatus.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('task turi: standart TASK, BUG bilan yaratiladi, keyin o‘zgartiriladi', async () => {
    const plain = await http().post(tasks()).set(as('lead')).send({ title: 'Oddiy' }).expect(201);
    expect(plain.body.type).toBe('TASK');
    const bug = await http().post(tasks()).set(as('dev')).send({ title: 'Login tugmasi ishlamaydi', type: 'BUG' }).expect(201);
    expect(bug.body.type).toBe('BUG');
    const changed = await http().patch(tasks(`/${bug.body.number}`)).set(as('dev')).send({ type: 'FEATURE' }).expect(200);
    expect(changed.body.type).toBe('FEATURE');
    await http().post(tasks()).set(as('dev')).send({ title: 'X', type: 'EPIC' }).expect(400);
  });

  it('kichik vazifalar: ota ichida ko‘rinadi, boardda yo‘q, progress hisoblanadi', async () => {
    const res = await http().post(tasks()).set(as('lead')).send({ title: 'To‘lov sahifasi', assigneeIds: [users.dev.id] }).expect(201);
    parent = res.body;
    const a = await http().post(tasks()).set(as('dev')).send({ title: 'Forma', parentId: parent.id }).expect(201);
    expect(a.body.parent).toMatchObject({ id: parent.id, key: `J${run}-${parent.number}`, title: 'To‘lov sahifasi' });
    // Ota raqami bilan ham bo'ladi.
    await http().post(tasks()).set(as('dev')).send({ title: 'Click API', parentId: String(parent.number) }).expect(201);

    const board = await http().get(tasks()).set(as('dev')).expect(200);
    expect(board.body.map((t: { title: string }) => t.title)).not.toContain('Forma');
    const boardParent = board.body.find((t: { id: string }) => t.id === parent.id);
    expect(boardParent.subtaskCount).toEqual({ total: 2, done: 0 });
    const withSubs = await http().get(tasks('?subtasks=true')).set(as('dev')).expect(200);
    expect(withSubs.body.map((t: { title: string }) => t.title)).toEqual(expect.arrayContaining(['Forma', 'Click API']));

    const detail = await http().get(tasks(`/${parent.number}`)).set(as('dev')).expect(200);
    expect(detail.body.subtasks.map((t: { title: string }) => t.title)).toEqual(['Forma', 'Click API']);
  });

  it('dasturchi kichik vazifani yopa oladi, ota taskni esa yo‘q (teamlead nazorati)', async () => {
    const detail = await http().get(tasks(`/${parent.number}`)).set(as('dev')).expect(200);
    const sub = detail.body.subtasks[0];
    await http().patch(tasks(`/${sub.number}`)).set(as('dev')).send({ statusId: statuses.Done }).expect(200);
    await http().patch(tasks(`/${sub.number}`)).set(as('dev')).send({ statusId: statuses['To do'] }).expect(200);
    await http().patch(tasks(`/${sub.number}`)).set(as('dev')).send({ statusId: statuses.Done }).expect(200);
    await http().patch(tasks(`/${parent.number}`)).set(as('dev')).send({ statusId: statuses.Done }).expect(403);

    const after = await http().get(tasks(`/${parent.number}`)).set(as('dev')).expect(200);
    expect(after.body.subtaskCount).toEqual({ total: 2, done: 1 });
  });

  it('bir darajadan chuqur va boshqa loyihadagi ota — 400', async () => {
    const detail = await http().get(tasks(`/${parent.number}`)).set(as('dev')).expect(200);
    await http().post(tasks()).set(as('dev')).send({ title: 'Chuqur', parentId: detail.body.subtasks[0].id }).expect(400);
    const other = await http().post(tasks('', projectIds[1])).set(as('lead')).send({ title: 'Boshqa loyiha' }).expect(201);
    await http().post(tasks()).set(as('lead')).send({ title: 'Begona ota', parentId: other.body.id }).expect(400);
  });

  it('tarix: yaratildi, kichik vazifa, maydonlar (eski → yangi), holat, mas’ullar, izoh', async () => {
    await http().patch(tasks(`/${parent.number}`)).set(as('lead')).send({ priority: 'HIGH', dueDate: '2026-12-01', description: 'Uzun matn' }).expect(200);
    await http().patch(tasks(`/${parent.number}`)).set(as('lead')).send({ statusId: statuses['In progress'] }).expect(200);
    await http().patch(tasks(`/${parent.number}`)).set(as('lead')).send({ assigneeIds: [users.lead.id] }).expect(200);
    await http().post(tasks(`/${parent.number}/comments`)).set(as('dev')).send({ body: 'Boshladim' }).expect(201);

    const res = await http().get(tasks(`/${parent.number}/history`)).set(as('dev')).expect(200);
    const kinds = res.body.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(['created', 'assignees', 'subtask', 'subtask', 'fields', 'status', 'assignees', 'comment']);
    expect(res.body[0]).toMatchObject({ actor: { name: 'E2E lead' }, status: 'Backlog' });
    expect(res.body[2]).toMatchObject({ kind: 'subtask', title: 'Forma', actor: { name: 'E2E dev' } });
    expect(res.body[4].changes).toEqual(
      expect.arrayContaining([
        { field: 'priority', from: 'MEDIUM', to: 'HIGH' },
        { field: 'dueDate', from: null, to: '2026-12-01' },
        { field: 'description', from: null, to: null },
      ]),
    );
    expect(res.body[5]).toMatchObject({ from: 'Backlog', to: 'In progress' });
    expect(res.body[6]).toMatchObject({ added: ['E2E lead'], removed: ['E2E dev'] });
  });
});
