import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { TelegramGateway } from '../src/notifications/telegram.gateway.js';

/** Xodimlarni boshqarish: rol, chiqarish, takliflar. */
type Who = 'owner' | 'admin' | 'lead' | 'dev' | 'dev2';
const ROLES: Record<Who, string> = { owner: 'owner', admin: 'admin', lead: 'member', dev: 'member', dev2: 'member' };

describe('Xodimlarni boshqarish (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_700_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const who: Who[] = ['owner', 'admin', 'lead', 'dev', 'dev2'];
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;
  let taskNumber: number;

  const http = () => request(app.getHttpServer());
  const as = (w: Who) => ({ Authorization: `Bearer ${users[w].token}` });
  const member = (w: Who) => `/api/v1/workspace/members/${users[w].id}`;

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
    for (const [i, w] of who.entries()) {
      const role = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: ROLES[w] } } });
      const user = await prisma.user.create({ data: { name: `E2E ${w} ${run}`, telegramId: BigInt(base + i + 1) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: role.id } });
      users[w] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key: `W${run}`, name: 'Xodimlar e2e' }).expect(201);
    projectId = project.body.id;
    for (const w of ['dev', 'dev2'] as Who[]) await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users[w].id }).expect(201);
    const task = await http()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(as('lead'))
      .send({ title: 'Ikkisiga', assigneeIds: [users.dev.id, users.dev2.id] })
      .expect(201);
    taskNumber = task.body.number;
    await http().post(`/api/v1/projects/${projectId}/incidents`).set(as('lead')).send({ title: 'Sayt sekin', ownerId: users.dev.id }).expect(201);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } });
    const incidents = await prisma.incident.findMany({ where: { projectId }, select: { id: true } });
    const entityIds = [projectId, ...userIds, ...tasks.map((t) => t.id), ...incidents.map((i) => i.id)];
    const events = await prisma.event.findMany({ where: { entityId: { in: entityIds } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.incident.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.invite.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('ro‘yxatda kimni boshqara olishim ko‘rinadi: admin rahbarni emas, oddiy a’zo hech kimni', async () => {
    const mine = (body: { userId: string; canManage: boolean }[]) => Object.fromEntries(body.filter((m) => Object.values(users).some((u) => u.id === m.userId)).map((m) => [m.userId, m.canManage]));
    const byOwner = mine((await http().get('/api/v1/workspace/members').set(as('owner')).expect(200)).body);
    expect(byOwner).toMatchObject({ [users.owner.id]: false, [users.admin.id]: true, [users.dev.id]: true });
    const byAdmin = mine((await http().get('/api/v1/workspace/members').set(as('admin')).expect(200)).body);
    expect(byAdmin).toMatchObject({ [users.owner.id]: false, [users.admin.id]: false, [users.dev.id]: true });
    const byLead = mine((await http().get('/api/v1/workspace/members').set(as('lead')).expect(200)).body);
    expect(Object.values(byLead).every((v) => v === false)).toBe(true);
  });

  it('rolni o‘zgartirish: oddiy a’zo — 403, admin rahbarni o‘zgartira/yarata olmaydi, o‘zini — 403', async () => {
    await http().patch(member('dev')).set(as('lead')).send({ role: 'admin' }).expect(403);
    await http().patch(member('owner')).set(as('admin')).send({ role: 'member' }).expect(403);
    await http().patch(member('dev')).set(as('admin')).send({ role: 'owner' }).expect(403);
    await http().patch(member('admin')).set(as('admin')).send({ role: 'member' }).expect(403);
    await http().patch(member('dev')).set(as('admin')).send({ role: 'teamlead' }).expect(400); // loyiha roli

    const res = await http().patch(member('lead')).set(as('admin')).send({ role: 'admin' }).expect(200);
    expect(res.body).toEqual({ userId: users.lead.id, role: 'admin' });
    await http().patch(member('lead')).set(as('owner')).send({ role: 'member' }).expect(200);
  });

  it('chiqarish: loyihalar, tasklar, insidentdan olinadi; sessiya yopiladi; endi hech narsa ochilmaydi', async () => {
    await prisma.session.create({ data: { userId: users.dev.id, tokenHash: `e2e-${run}-${Math.random()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    await http().delete(member('dev')).set(as('lead')).expect(403);
    await http().delete(member('owner')).set(as('admin')).expect(403);

    const res = await http().delete(member('dev')).set(as('admin')).expect(200);
    expect(res.body).toEqual({ userId: users.dev.id, tasks: 1, projects: 1, incidents: 1 });

    expect(await prisma.session.count({ where: { userId: users.dev.id, revokedAt: null } })).toBe(0);
    await http().get('/api/v1/auth/me').set(as('dev')).expect(401);
    await http().get('/api/v1/projects').set(as('dev')).expect(403);

    const task = await http().get(`/api/v1/projects/${projectId}/tasks/${taskNumber}`).set(as('lead')).expect(200);
    expect(task.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([users.dev2.id]);
    const incident = await http().get(`/api/v1/projects/${projectId}/incidents/1`).set(as('lead')).expect(200);
    expect(incident.body.owner).toBeNull();
    const project = await http().get(`/api/v1/projects/${projectId}`).set(as('lead')).expect(200);
    expect(project.body.members.map((m: { userId: string }) => m.userId)).not.toContain(users.dev.id);

    await http().delete(member('dev')).set(as('admin')).expect(404);
  });

  it('loyihadan chiqarilgan odam shu loyiha tasklaridan ham olinadi', async () => {
    await http().delete(`/api/v1/projects/${projectId}/members/${users.dev2.id}`).set(as('lead')).expect(204);
    const task = await http().get(`/api/v1/projects/${projectId}/tasks/${taskNumber}`).set(as('lead')).expect(200);
    expect(task.body.assignees).toEqual([]);
  });

  it('takliflar: ro‘yxat, bekor qilish; bekor qilingan havola ishlamaydi', async () => {
    const created = await http().post('/api/v1/invites').set(as('admin')).send({ role: 'member', note: `Sardor ${run}` }).expect(201);
    const list = await http().get('/api/v1/invites').set(as('admin')).expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, role: 'member', note: `Sardor ${run}`, createdBy: `E2E admin ${run}` })]));
    await http().get('/api/v1/invites').set(as('lead')).expect(403);

    await http().delete(`/api/v1/invites/${created.body.id}`).set(as('admin')).expect(204);
    const after = await http().get('/api/v1/invites').set(as('admin')).expect(200);
    expect(after.body.map((i: { id: string }) => i.id)).not.toContain(created.body.id);
    await http().delete(`/api/v1/invites/${created.body.id}`).set(as('admin')).expect(404);
  });
});
