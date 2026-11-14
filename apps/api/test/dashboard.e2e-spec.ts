import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { addDays, localDay } from '../src/tasks/due.js';

type Who = 'admin' | 'lead' | 'mentor';

describe('Rahbar dashboardi (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = `D${run}`;
  const users = {} as Record<Who, { id: string; token: string }>;
  const today = localDay(new Date());
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const role = async (name: string) => (await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name } } })).id;
    for (const [who, r] of [['admin', 'admin'], ['lead', 'member'], ['mentor', 'member']] as [Who, string][]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who} ${run}` } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: await role(r) } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }

    const project = await http()
      .post('/api/v1/projects')
      .set(as('lead'))
      .send({ key, name: 'Dashboard e2e', dueDate: addDays(today, -1) })
      .expect(201);
    projectId = project.body.id;
    const statuses: Record<string, string> = Object.fromEntries(project.body.statuses.map((s: { name: string; id: string }) => [s.name, s.id]));
    await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.mentor.id }).expect(201);
    const create = (body: object) => http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send(body).expect(201);
    await create({ title: 'Kechikkan', assigneeId: users.mentor.id, dueDate: addDays(today, -3), statusId: statuses['In progress'] });
    await create({ title: 'Review’da', assigneeId: users.mentor.id, statusId: statuses.Review });
    await create({ title: 'Yopildi', assigneeId: users.mentor.id, statusId: statuses.Done });
    await create({ title: 'Egasiz' });
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id);
    await prisma.notification.deleteMany({ where: { event: { entityId: { in: [projectId, ...taskIds] } } } });
    await prisma.event.deleteMany({ where: { entityId: { in: [projectId, ...taskIds] } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('dashboard.view_all bo‘lmasa 403, tokensiz 401', async () => {
    await http().get('/api/v1/dashboard').expect(401);
    await http().get('/api/v1/dashboard').set(as('lead')).expect(403);
  });

  it('rahbar loyiha progressi, kechikkanlar, odamlar yuklamasi va bu hafta yopilganlarni ko‘radi', async () => {
    const res = await http().get('/api/v1/dashboard').set(as('admin')).expect(200);
    const body = res.body;
    expect(body.today).toBe(today);

    const project = body.projects.find((p: { id: string }) => p.id === projectId);
    expect(project).toMatchObject({
      key,
      total: 4,
      progress: 25,
      overdue: 1,
      late: true,
      counts: { TODO: 1, IN_PROGRESS: 1, REVIEW: 1, DONE: 1, CANCELED: 0 },
    });

    const late = body.overdue.find((t: { key: string }) => t.key === `${key}-1`);
    expect(late).toMatchObject({ title: 'Kechikkan', daysLate: 3, assignee: { userId: users.mentor.id } });

    const mentor = body.people.find((p: { userId: string }) => p.userId === users.mentor.id);
    expect(mentor).toMatchObject({ open: 2, inProgress: 1, review: 1, overdue: 1, doneThisWeek: 1 });

    expect(body.doneThisWeek.map((t: { key: string }) => t.key)).toContain(`${key}-3`);
    expect(body.summary.unassigned).toBeGreaterThanOrEqual(1);
  });
});
