import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';

type Who = 'lead' | 'dev' | 'junior';

describe('Rollarni boshqarish (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let workspaceId: string;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const member = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });
    for (const who of ['lead', 'dev', 'junior'] as Who[]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who} ${run}` } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: member.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key: `R${run}`, name: 'Rollar e2e' }).expect(201);
    projectId = project.body.id;
    await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.dev.id }).expect(201);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    await prisma.notification.deleteMany({ where: { event: { entityId: projectId } } });
    await prisma.event.deleteMany({ where: { entityId: projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.role.deleteMany({ where: { id: { in: created } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('rollar ro‘yxati: o‘zbekcha nomlar; teamlead boshqara oladi, dasturchi — yo‘q', async () => {
    const lead = await http().get('/api/v1/roles').set(as('lead')).expect(200);
    expect(lead.body.canManage).toBe(true);
    expect(lead.body.roles.find((r: { name: string }) => r.name === 'developer')).toMatchObject({ title: 'Dasturchi', isSystem: true });
    expect(lead.body.roles.some((r: { name: string }) => r.name === 'mentor')).toBe(false);

    const dev = await http().get('/api/v1/roles').set(as('dev')).expect(200);
    expect(dev.body.canManage).toBe(false);
    expect(dev.body.permissions.find((p: { key: string }) => p.key === 'task.close').allowed).toBe(false);
    await http().post('/api/v1/roles').set(as('dev')).send({ title: 'Men xohlagan rol', permissions: ['task.create'] }).expect(403);
  });

  it('teamlead yangi rol yaratadi va uni loyihada beradi', async () => {
    const res = await http()
      .post('/api/v1/roles')
      .set(as('lead'))
      .send({ title: `QA muhandis ${run}`, permissions: ['task.create', 'task.comment', 'task.comment', 'role.manage'] })
      .expect(201);
    created.push(res.body.id);
    expect(res.body).toMatchObject({ name: `qa_muhandis_${run.toLowerCase()}`, title: `QA muhandis ${run}`, scope: 'PROJECT', isSystem: false });
    // Task ruxsati bor rol boardni ham ko'rishi kerak: task.view avtomatik qo'shiladi.
    expect(res.body.permissions).toEqual(['task.create', 'task.comment', 'role.manage', 'task.view']);

    const add = await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.junior.id, role: res.body.name }).expect(201);
    expect(add.body.role).toBe(res.body.name);
  });

  it('loyihaga taalluqsiz ruxsat 400, bo‘sh ro‘yxat 400', async () => {
    await http().post('/api/v1/roles').set(as('lead')).send({ title: 'Superadmin', permissions: ['workspace.manage'] }).expect(400);
    await http().post('/api/v1/roles').set(as('lead')).send({ title: 'Bo‘sh', permissions: [] }).expect(400);
  });

  it('o‘zida yo‘q ruxsatni berib bo‘lmaydi (rol oshirishdan himoya)', async () => {
    // junior: role.manage bor, task.close yo'q
    const res = await http().post('/api/v1/roles').set(as('junior')).send({ title: 'Yopuvchi', permissions: ['task.close'] }).expect(403);
    expect(res.body.message).toContain('task.close');
    const ok = await http().post('/api/v1/roles').set(as('junior')).send({ title: `Sharhlovchi ${run}`, permissions: ['task.comment'] }).expect(201);
    created.push(ok.body.id);
  });

  it('tahrirlash va o‘chirish: ishlatilayotgan rol 409, tizim roli 403', async () => {
    const qa = created[0];
    const renamed = await http().patch(`/api/v1/roles/${qa}`).set(as('lead')).send({ title: `QA ${run}` }).expect(200);
    expect(renamed.body.title).toBe(`QA ${run}`);
    await http().delete(`/api/v1/roles/${qa}`).set(as('lead')).expect(409);

    const roles = await http().get('/api/v1/roles').set(as('lead')).expect(200);
    const developer = roles.body.roles.find((r: { name: string }) => r.name === 'developer');
    await http().patch(`/api/v1/roles/${developer.id}`).set(as('lead')).send({ title: 'Buzish' }).expect(403);
    await http().delete(`/api/v1/roles/${developer.id}`).set(as('lead')).expect(403);

    await http().delete(`/api/v1/roles/${created[1]}`).set(as('lead')).expect(204);
    created.splice(1, 1);
  });
});
