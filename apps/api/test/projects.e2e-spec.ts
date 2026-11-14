import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/db/prisma.service.js';

describe('Loyihalar va a’zolar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let workspaceId: string;
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const key = `E${run}`;
  const customRoles = { editor: `e2e_editor_${run}`, super: `e2e_super_${run}` };
  const users = {} as Record<'admin' | 'lead' | 'mentor' | 'outsider' | 'stranger', { id: string; token: string }>;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof users) => ({ Authorization: `Bearer ${users[who].token}` });
  const events = (type: string) => prisma.event.findMany({ where: { entityId: projectId, type } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;

    const roleId = async (name: string) =>
      (await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name } } })).id;
    const plan: [keyof typeof users, string | null][] = [
      ['admin', 'admin'],
      ['lead', 'member'],
      ['mentor', 'member'],
      ['outsider', 'member'],
      ['stranger', null],
    ];
    for (const [who, role] of plan) {
      const user = await prisma.user.create({ data: { name: `E2E ${who} ${run}` } });
      if (role) await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: await roleId(role) } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    // Loyiha roli ruxsatlari loyiha darajasida ishlashini tekshirish uchun maxsus rollar.
    await prisma.role.createMany({
      data: [
        { workspaceId, name: customRoles.editor, scope: 'PROJECT', permissions: ['project.update'] },
        { workspaceId, name: customRoles.super, scope: 'PROJECT', permissions: ['workspace.manage'] },
      ],
    });
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const projects = await prisma.project.findMany({ where: { workspaceId, key: { startsWith: key } }, select: { id: true } });
    const projectIds = projects.map((p) => p.id);
    await prisma.notification.deleteMany({ where: { event: { entityId: { in: projectIds } } } });
    await prisma.event.deleteMany({ where: { entityId: { in: projectIds } } });
    await prisma.workflowStatus.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.role.deleteMany({ where: { workspaceId, name: { in: Object.values(customRoles) } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('token bo‘lmasa 401, workspace a’zosi bo‘lmasa 403', async () => {
    await http().get('/api/v1/projects').expect(401);
    await http().get('/api/v1/projects').set(as('stranger')).expect(403);
    await http().post('/api/v1/projects').set(as('stranger')).send({ key: 'XX', name: 'Begona' }).expect(403);
    await http().get('/api/v1/workspace/members').set(as('stranger')).expect(403);
  });

  it('yaratuvchi teamlead bo‘ladi, 5 ta status va project.created eventi yoziladi', async () => {
    const res = await http()
      .post('/api/v1/projects')
      .set(as('lead'))
      .send({ key: key.toLowerCase(), name: 'E2E loyiha', startDate: '2026-11-01', dueDate: '2026-12-01' })
      .expect(201);
    projectId = res.body.id;
    expect(res.body.key).toBe(key);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.statuses.map((s: { name: string }) => s.name)).toEqual(['Backlog', 'To do', 'In progress', 'Review', 'Done']);
    expect(res.body.members).toEqual([expect.objectContaining({ userId: users.lead.id, role: 'teamlead' })]);
    expect(res.body.myRole).toBe('teamlead');
    expect(res.body.myPermissions).toContain('project.member.manage');

    const [event] = await events('project.created');
    expect(event).toMatchObject({ actorId: users.lead.id, entityType: 'project', publishedAt: null, payload: { key } });
  });

  it('kalit band bo‘lsa 409, noto‘g‘ri ma’lumotga 400', async () => {
    await http().post('/api/v1/projects').set(as('lead')).send({ key, name: 'Takror' }).expect(409);
    await http().post('/api/v1/projects').set(as('lead')).send({ key: '1AB', name: 'Raqam bilan' }).expect(400);
    await http()
      .post('/api/v1/projects')
      .set(as('lead'))
      .send({ key: `${key}X`, name: 'Sana', startDate: '2026-12-01', dueDate: '2026-11-01' })
      .expect(400);
  });

  it('begona loyiha 404, rahbar (dashboard.view_all) hammasini ko‘radi', async () => {
    await http().get(`/api/v1/projects/${projectId}`).set(as('outsider')).expect(404);
    const outsiderList = await http().get('/api/v1/projects').set(as('outsider')).expect(200);
    expect(outsiderList.body.map((p: { id: string }) => p.id)).not.toContain(projectId);

    const adminView = await http().get(`/api/v1/projects/${projectId}`).set(as('admin')).expect(200);
    expect(adminView.body.myRole).toBeNull();
    const adminList = await http().get('/api/v1/projects').set(as('admin')).expect(200);
    expect(adminList.body.find((p: { id: string }) => p.id === projectId)).toMatchObject({ myRole: null, memberCount: 1 });
  });

  it('teamlead a’zo qo‘shadi; takror 409, workspace’dan tashqaridagi 404, noma’lum rol 400', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(as('lead'))
      .send({ userId: users.mentor.id })
      .expect(201);
    expect(res.body).toMatchObject({ userId: users.mentor.id, role: 'developer' });
    expect(await events('project.member_added')).toHaveLength(1);

    const add = (body: object) => http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send(body);
    await add({ userId: users.mentor.id }).expect(409);
    await add({ userId: users.stranger.id }).expect(404);
    await add({ userId: users.outsider.id, role: 'owner' }).expect(400);
    await add({ userId: users.outsider.id, role: 'nimadir' }).expect(400);
  });

  it('mentor loyihani ko‘radi, lekin a’zo qo‘sha olmaydi va tahrirlay olmaydi', async () => {
    const list = await http().get('/api/v1/projects').set(as('mentor')).expect(200);
    expect(list.body.find((p: { id: string }) => p.id === projectId)).toMatchObject({ myRole: 'developer', memberCount: 2 });
    await http().get(`/api/v1/projects/${projectId}`).set(as('mentor')).expect(200);
    await http()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(as('mentor'))
      .send({ userId: users.outsider.id })
      .expect(403);
    await http().patch(`/api/v1/projects/${projectId}`).set(as('mentor')).send({ name: 'Yangi nom' }).expect(403);
  });

  it('rol o‘zgartirish: o‘zinikini 403, yuqori ruxsatli rol 403, oddiy holatda event yoziladi', async () => {
    const patch = (userId: string, role: string) =>
      http().patch(`/api/v1/projects/${projectId}/members/${userId}`).set(as('lead')).send({ role });
    await patch(users.lead.id, 'developer').expect(403);
    await patch(users.mentor.id, customRoles.super).expect(403);
    await patch(users.outsider.id, 'developer').expect(404);

    const res = await patch(users.mentor.id, customRoles.editor).expect(200);
    expect(res.body.role).toBe(customRoles.editor);
    const [event] = await events('project.member_role_changed');
    expect(event.payload).toMatchObject({ userId: users.mentor.id, from: 'developer', to: customRoles.editor });
  });

  it('loyiha roli ruxsati ishlaydi: project.update bor, project.archive yo‘q', async () => {
    const asEditor = (body: object) => http().patch(`/api/v1/projects/${projectId}`).set(as('mentor')).send(body);
    const res = await asEditor({ name: 'Tahrirlangan nom', description: 'Tavsif' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Tahrirlangan nom', description: 'Tavsif' });
    await asEditor({ status: 'ARCHIVED' }).expect(403);
    await asEditor({ dueDate: '2026-10-01' }).expect(400);
    await asEditor({}).expect(400);
  });

  it('teamlead holatni o‘zgartiradi va arxivlaydi; arxiv ro‘yxatdan yashirinadi', async () => {
    const patch = (body: object) => http().patch(`/api/v1/projects/${projectId}`).set(as('lead')).send(body);
    await patch({ status: 'ON_HOLD' }).expect(200);
    await patch({ status: 'ARCHIVED' }).expect(200);

    const changes = await events('project.status_changed');
    expect(changes.map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        { from: 'ACTIVE', to: 'ON_HOLD' },
        { from: 'ON_HOLD', to: 'ARCHIVED' },
      ]),
    );

    const active = await http().get('/api/v1/projects').set(as('lead')).expect(200);
    expect(active.body.map((p: { id: string }) => p.id)).not.toContain(projectId);
    const all = await http().get('/api/v1/projects?archived=true').set(as('lead')).expect(200);
    expect(all.body.map((p: { id: string }) => p.id)).toContain(projectId);
  });

  it('a’zoni chiqarish: o‘zini 403, boshqani 204 va event; chiqarilgan odamga loyiha 404', async () => {
    await http().delete(`/api/v1/projects/${projectId}/members/${users.lead.id}`).set(as('lead')).expect(403);
    await http().delete(`/api/v1/projects/${projectId}/members/${users.mentor.id}`).set(as('lead')).expect(204);
    await http().delete(`/api/v1/projects/${projectId}/members/${users.mentor.id}`).set(as('lead')).expect(404);
    expect(await events('project.member_removed')).toHaveLength(1);
    await http().get(`/api/v1/projects/${projectId}`).set(as('mentor')).expect(404);
  });

  it('workspace a’zolari ro‘yxati Telegram ID’siz qaytadi', async () => {
    const res = await http().get('/api/v1/workspace/members').set(as('mentor')).expect(200);
    const ids = res.body.map((m: { userId: string }) => m.userId);
    expect(ids).toEqual(expect.arrayContaining([users.lead.id, users.mentor.id, users.admin.id]));
    expect(ids).not.toContain(users.stranger.id);
    expect(res.body[0]).not.toHaveProperty('telegramId');
  });
});
