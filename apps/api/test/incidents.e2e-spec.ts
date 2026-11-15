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

/** lead — teamlead, dev/dev2 — dasturchilar, client — mijoz, outsider — loyihada yo'q. */
type Who = 'lead' | 'dev' | 'dev2' | 'client' | 'outsider';

class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  async send(chatId: string, message: RenderedMessage) {
    this.sent.push({ chatId, message });
  }
}

describe('Insidentlar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_500_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const who: Who[] = ['lead', 'dev', 'dev2', 'client', 'outsider'];
  const tg = Object.fromEntries(who.map((w, i) => [w, base + i + 1])) as Record<Who, number>;
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const as = (w: Who) => ({ Authorization: `Bearer ${users[w].token}` });
  const url = (path = '') => `/api/v1/projects/${projectId}/incidents${path}`;
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };
  const byNum = (a: number, b: number) => a - b;
  const sentTo = () => telegram.sent.splice(0).map((s) => ({ to: Number(s.chatId), text: s.message.text }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TelegramGateway).useValue(telegram).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const role = (name: string) => prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name } } });
    const [member, client] = await Promise.all([role('member'), role('client')]);
    for (const w of who) {
      const user = await prisma.user.create({ data: { name: `E2E ${w}`, telegramId: BigInt(tg[w]) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: (w === 'client' ? client : member).id } });
      users[w] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key: `I${run}`, name: 'Insident e2e' }).expect(201);
    projectId = project.body.id;
    for (const w of ['dev', 'dev2'] as Who[]) await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users[w].id }).expect(201);
    await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.client.id, role: 'guest' }).expect(201);
    await flush();
    telegram.sent.splice(0);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const incidents = await prisma.incident.findMany({ where: { projectId }, select: { id: true } });
    const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } });
    const entityIds = [projectId, ...incidents.map((i) => i.id), ...tasks.map((t) => t.id)];
    const events = await prisma.event.findMany({ where: { entityId: { in: entityIds } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.incident.deleteMany({ where: { projectId } }); // xronologiya cascade bilan
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('dasturchi insident ochadi: raqam INC-1, holat Ochiq, jamoaga Telegram xabari (mijozga emas)', async () => {
    const res = await http()
      .post(url())
      .set(as('dev'))
      .send({ title: 'To‘lov o‘tmayapti', description: 'Click 500 qaytaryapti', severity: 'SEV1' })
      .expect(201);
    expect(res.body).toMatchObject({ number: 1, key: 'INC-1', status: 'OPEN', severity: 'SEV1', owner: null, reporter: expect.objectContaining({ userId: users.dev.id }) });

    await flush();
    const sent = sentTo();
    expect(sent.map((s) => s.to).sort(byNum)).toEqual([tg.lead, tg.dev2].sort(byNum));
    expect(sent[0].text).toContain('🚨 Yangi insident · 🔴 SEV1 · Kritik');
    expect(sent[0].text).toContain(`<b>I${run} · INC-1</b> · To‘lov o‘tmayapti`);
    expect(sent[0].text).toContain('Mas’ul: hali yo‘q');

    const project = await http().get(`/api/v1/projects/${projectId}`).set(as('lead')).expect(200);
    expect(project.body.openIncidents).toBe(1);
  });

  it('mijoz va begona insidentlarni ko‘rmaydi; mijoz ocha olmaydi', async () => {
    await http().get(url()).set(as('client')).expect(403);
    await http().post(url()).set(as('client')).send({ title: 'Sayt ochilmayapti' }).expect(403);
    await http().get(url()).set(as('outsider')).expect(404);
    const project = await http().get(`/api/v1/projects/${projectId}`).set(as('client')).expect(200);
    expect(project.body.openIncidents).toBeNull();
  });

  it('mas’ul tayinlanadi: holat Tekshirilmoqda, mas’ulga xabar; mijoz mas’ul bo‘la olmaydi', async () => {
    await http().patch(url('/1')).set(as('lead')).send({ ownerId: users.client.id }).expect(400);
    const res = await http().patch(url('/1')).set(as('lead')).send({ ownerId: users.dev2.id }).expect(200);
    expect(res.body).toMatchObject({ status: 'INVESTIGATING', owner: expect.objectContaining({ userId: users.dev2.id }) });

    await flush();
    const sent = sentTo();
    // Mas'ulga "mas'ul qildi", qolganlarga holat o'zgargani (bitta odamga bitta xabar).
    expect(sent.find((s) => s.to === tg.dev2)?.text).toContain('🧯 E2E lead sizni insidentga mas’ul qildi');
    expect(sent.find((s) => s.to === tg.dev)?.text).toContain('Holat: Ochiq → <b>Tekshirilmoqda</b>');
    expect(sent.filter((s) => s.to === tg.dev2)).toHaveLength(1);
    expect(sent.some((s) => s.to === tg.lead)).toBe(false);
  });

  it('yangilanish yoziladi: mas’ul va xabar berganga boradi', async () => {
    await http().post(url('/1/updates')).set(as('lead')).send({ body: 'Click bilan bog‘landik, ular tomonda nosozlik' }).expect(201);
    await http().post(url('/1/updates')).set(as('lead')).send({ body: '  ' }).expect(400);
    await flush();
    const sent = sentTo();
    expect(sent.map((s) => s.to).sort(byNum)).toEqual([tg.dev, tg.dev2].sort(byNum));
    expect(sent[0].text).toContain('📝 E2E lead insidentga yangilanish yozdi');
    expect(sent[0].text).toContain('ular tomonda nosozlik');
  });

  it('hal qilinadi: vaqt yoziladi, sabab va yechim xabarda; xronologiya to‘liq', async () => {
    const res = await http()
      .patch(url('/1'))
      .set(as('dev2'))
      .send({ status: 'RESOLVED', resolution: 'Click kalitini yangiladik, to‘lovlar o‘tyapti' })
      .expect(200);
    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.resolvedAt).not.toBeNull();

    await flush();
    const sent = sentTo();
    expect(sent.map((s) => s.to).sort(byNum)).toEqual([tg.lead, tg.dev].sort(byNum));
    expect(sent[0].text).toContain('✅ Insident hal qilindi');
    expect(sent[0].text).toContain('davomiyligi');
    expect(sent[0].text).toContain('Click kalitini yangiladik');

    const detail = await http().get(url('/1')).set(as('dev')).expect(200);
    expect(detail.body.updates.map((u: { kind: string; to: string | null }) => `${u.kind}:${u.to ?? ''}`)).toEqual([
      'created:SEV1',
      `owner:${users.dev2.id}`,
      'status:INVESTIGATING',
      'note:',
      'status:RESOLVED',
    ]);
    const project = await http().get(`/api/v1/projects/${projectId}`).set(as('lead')).expect(200);
    expect(project.body.openIncidents).toBe(0);
  });

  it('qayta ochiladi: hal qilingan vaqt o‘chadi; daraja o‘zgarishi xabarda', async () => {
    const res = await http().patch(url('/1')).set(as('lead')).send({ status: 'INVESTIGATING', severity: 'SEV2' }).expect(200);
    expect(res.body).toMatchObject({ status: 'INVESTIGATING', severity: 'SEV2', resolvedAt: null });
    await flush();
    const text = sentTo().find((s) => s.to === tg.dev)?.text;
    expect(text).toContain('🔁 Insident qayta ochildi');
    expect(text).toContain('Daraja: SEV1 → <b>🟠 SEV2 · Jiddiy</b>');
  });

  it('ro‘yxat: ochiqlari og‘ir darajadan; filtr; kelajakdagi boshlanish vaqti 400', async () => {
    await http().post(url()).set(as('lead')).send({ title: 'Rasm yuklanmaydi', severity: 'SEV4', ownerId: users.dev.id }).expect(201);
    await http().post(url()).set(as('lead')).send({ title: 'Kelajak', startedAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(400);
    const third = await http().post(url()).set(as('lead')).send({ title: 'Eski xato', severity: 'SEV3' }).expect(201);
    await http().patch(url(`/${third.body.number}`)).set(as('lead')).send({ status: 'RESOLVED' }).expect(200);

    const all = await http().get(url()).set(as('dev')).expect(200);
    expect(all.body.map((i: { key: string }) => i.key)).toEqual(['INC-1', 'INC-2', 'INC-3']);
    const open = await http().get(url('?status=open')).set(as('dev')).expect(200);
    expect(open.body.map((i: { key: string; status: string }) => `${i.key}:${i.status}`)).toEqual(['INC-1:INVESTIGATING', 'INC-2:INVESTIGATING']);
    const resolved = await http().get(url('?status=resolved')).set(as('dev')).expect(200);
    expect(resolved.body.map((i: { key: string }) => i.key)).toEqual(['INC-3']);
    await http().get(url('/999')).set(as('dev')).expect(404);
  });

  it('insidentdan task: bog‘lanadi, xronologiyada ko‘rinadi, mas’ulga xabarda insident nomi', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(as('lead'))
      .send({ title: 'Click kalitini avtomatik yangilash', priority: 'HIGH', assigneeIds: [users.dev.id], incidentId: (await http().get(url('/1')).set(as('lead'))).body.id })
      .expect(201);
    expect(res.body.incident).toMatchObject({ key: 'INC-1', number: 1, title: 'To‘lov o‘tmayapti' });

    const detail = await http().get(url('/1')).set(as('dev')).expect(200);
    expect(detail.body.tasks).toEqual([
      expect.objectContaining({ key: `I${run}-${res.body.number}`, title: 'Click kalitini avtomatik yangilash', assignees: [expect.objectContaining({ userId: users.dev.id })] }),
    ]);
    expect(detail.body.updates.at(-1)).toMatchObject({ kind: 'task', body: 'Click kalitini avtomatik yangilash', to: `I${run}-${res.body.number}` });

    const task = await http().get(`/api/v1/projects/${projectId}/tasks/${res.body.number}`).set(as('dev')).expect(200);
    expect(task.body.incident).toMatchObject({ key: 'INC-1' });

    await flush();
    // Oldingi testdagi INC-2 mas'ul xabari ham navbatda bo'lishi mumkin: task xabarini ajratib olamiz.
    const assigned = sentTo().find((s) => s.to === tg.dev && s.text.includes('sizga task berdi'))?.text;
    expect(assigned).toContain('🚨 Insidentdan: INC-1 · To‘lov o‘tmayapti');

    // Boshqa loyihaning yoki noma'lum insidenti — 400.
    await http().post(`/api/v1/projects/${projectId}/tasks`).set(as('lead')).send({ title: 'X', incidentId: 'yoq' }).expect(400);
  });

  it('arxivdagi loyihada insident ochib bo‘lmaydi', async () => {
    await http().patch(`/api/v1/projects/${projectId}`).set(as('lead')).send({ status: 'ARCHIVED' }).expect(200);
    await http().post(url()).set(as('lead')).send({ title: 'Kech' }).expect(409);
    await http().get(url()).set(as('lead')).expect(200);
  });
});
