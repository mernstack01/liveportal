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
import { DealStepJob } from '../src/scheduler/deal-step.job.js';
import { InvitesService } from '../src/invites/invites.service.js';

/** boss — rahbar; sales/sales2 — A'zo + "Savdo"; dev — oddiy a'zo; admin — admin (savdo yo'q). */
type Who = 'boss' | 'sales' | 'sales2' | 'dev' | 'admin';
const PRIMARY: Record<Who, string> = { boss: 'owner', sales: 'member', sales2: 'member', dev: 'member', admin: 'admin' };

class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  async send(chatId: string, message: RenderedMessage) {
    this.sent.push({ chatId, message });
  }
}

describe('Kelishuvlar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_300_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const who: Who[] = ['boss', 'sales', 'sales2', 'dev', 'admin'];
  const tg = Object.fromEntries(who.map((w, i) => [w, base + i + 1])) as Record<Who, number>;
  const name = Object.fromEntries(who.map((w) => [tg[w], w])) as Record<number, Who>;
  const users = {} as Record<Who, { id: string; token: string }>;
  const dealIds: string[] = [];
  /** Taklifni qabul qilib qo'shilgan mijoz (tozalash uchun). */
  const extraUsers: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (w: Who) => ({ Authorization: `Bearer ${users[w].token}` });
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };
  /** Faqat shu test odamlariga ketgan xabarlar (bazada boshqa rahbarlar ham bo'lishi mumkin). */
  const sent = () =>
    telegram.sent
      .splice(0)
      .filter((s) => name[Number(s.chatId)])
      .map((s) => ({ to: name[Number(s.chatId)], text: s.message.text }));
  const inHour = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const newDeal = (by: Who, extra: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/deals')
      .set(as(by))
      .send({ title: `USTA do‘kon ${run}`, clientName: 'Akmal aka', clientContact: '+998 90 123 45 67', source: 'TELEGRAM', amount: '150 000 000', nextStep: 'Qo‘ng‘iroq qilish', nextStepAt: inHour(2), ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TelegramGateway).useValue(telegram).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const sales = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'sales' } } });
    for (const w of who) {
      const role = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: PRIMARY[w] } } });
      const user = await prisma.user.create({ data: { name: `E2E ${w} ${run}`, telegramId: BigInt(tg[w]) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: role.id } });
      if (w === 'sales' || w === 'sales2') await prisma.workspaceMemberRole.create({ data: { workspaceId, userId: user.id, roleId: sales.id } });
      users[w] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    await flush();
    telegram.sent.length = 0;
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const deals = await prisma.deal.findMany({ where: { OR: [{ id: { in: dealIds } }, { createdById: { in: userIds } }] }, select: { id: true } });
    const ids = deals.map((d) => d.id);
    const projectIds = (await prisma.deal.findMany({ where: { id: { in: ids }, projectId: { not: null } }, select: { projectId: true } })).map((d) => d.projectId!);
    const events = await prisma.event.findMany({ where: { entityId: { in: [...ids, ...userIds, ...projectIds] } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.attachment.deleteMany({ where: { dealActivity: { dealId: { in: ids } } } });
    await prisma.deal.deleteMany({ where: { id: { in: ids } } });
    await prisma.invite.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { createdById: { in: userIds } }] } });
    await prisma.workflowStatus.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.workspaceMemberRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: [...userIds, ...extraUsers] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, ...extraUsers] } } });
    await app.close();
  });

  it('kirish: savdo roli yoki rahbar; oddiy a’zo va admin — 403', async () => {
    await http().get('/api/v1/deals').set(as('dev')).expect(403);
    await http().get('/api/v1/deals').set(as('admin')).expect(403);
    await http().get('/api/v1/deals').set(as('sales')).expect(200);
    await http().get('/api/v1/deals').set(as('boss')).expect(200);
    const owners = await http().get('/api/v1/deals/owners').set(as('sales')).expect(200);
    const ids = owners.body.map((o: { userId: string }) => o.userId);
    expect(ids).toEqual(expect.arrayContaining([users.boss.id, users.sales.id, users.sales2.id]));
    expect(ids).not.toContain(users.dev.id);
    expect(ids).not.toContain(users.admin.id);
  });

  it('yaratish: keyingi qadam majburiy; rahbarga “yangi so‘rov” xabari', async () => {
    await newDeal('sales', { nextStep: undefined }).expect(400);
    await newDeal('sales', { amount: '12abc' }).expect(400);
    const res = await newDeal('sales').expect(201);
    dealIds.push(res.body.id);
    expect(res.body).toMatchObject({ key: `K-${res.body.number}`, stage: 'NEW', amount: '150000000', currency: 'UZS', owner: { userId: users.sales.id } });

    await flush();
    const messages = sent();
    expect(messages.map((m) => m.to)).toEqual(['boss']);
    expect(messages[0].text).toContain('Yangi so‘rov');
    expect(messages[0].text).toContain('150 000 000 so‘m');
  });

  it('ko‘rinish: savdochi faqat o‘zinikini, rahbar hammasini; boshqaga faqat rahbar biriktiradi', async () => {
    await newDeal('sales2', { ownerId: users.sales.id }).expect(403);
    await newDeal('boss', { ownerId: users.dev.id }).expect(400); // savdo ruxsati yo'q
    const forSales2 = await newDeal('boss', { ownerId: users.sales2.id, title: `GISHT ${run}`, currency: 'USD', amount: 2500 }).expect(201);
    dealIds.push(forSales2.body.id);
    await flush();
    expect(sent()).toEqual([expect.objectContaining({ to: 'sales2', text: expect.stringContaining('sizni kelishuvga mas’ul qildi') })]);

    const mine = (w: Who) => http().get('/api/v1/deals').query({ q: run }).set(as(w)).expect(200);
    expect((await mine('sales')).body.map((d: { id: string }) => d.id)).toEqual([dealIds[0]]);
    expect((await mine('sales2')).body.map((d: { id: string }) => d.id)).toEqual([dealIds[1]]);
    expect((await mine('boss')).body).toHaveLength(2);
    const filtered = await http().get('/api/v1/deals').query({ q: run, ownerId: users.sales2.id }).set(as('boss')).expect(200);
    expect(filtered.body.map((d: { id: string }) => d.id)).toEqual([dealIds[1]]);

    await http().get(`/api/v1/deals/${forSales2.body.number}`).set(as('sales')).expect(404);
    await http().patch(`/api/v1/deals/${forSales2.body.number}`).set(as('sales')).send({ title: 'x' }).expect(404);
  });

  it('bosqichlar: “Yutildi” qo‘lda emas, “Yo‘qotildi” sabab bilan; mas’ulni faqat rahbar almashtiradi', async () => {
    const deal = await http().get(`/api/v1/deals/${dealIds[0]}`).set(as('sales')).expect(200);
    const ref = `/api/v1/deals/${deal.body.number}`;
    await http().patch(ref).set(as('sales')).send({ stage: 'WON' }).expect(400);
    await http().patch(ref).set(as('sales')).send({ stage: 'LOST' }).expect(400);
    await http().patch(ref).set(as('sales')).send({ ownerId: users.sales2.id }).expect(403);

    await http().patch(ref).set(as('sales')).send({ stage: 'PROPOSAL' }).expect(200);
    const lost = await http().patch(ref).set(as('sales')).send({ stage: 'LOST', lostReason: 'Qimmat dedi' }).expect(200);
    expect(lost.body).toMatchObject({ stage: 'LOST', lostReason: 'Qimmat dedi' });
    expect(lost.body.closedAt).not.toBeNull();
    const reopened = await http().patch(ref).set(as('sales')).send({ stage: 'DISCUSSION' }).expect(200);
    expect(reopened.body).toMatchObject({ stage: 'DISCUSSION', lostReason: null, closedAt: null });

    await flush();
    const messages = sent();
    expect(messages.filter((m) => m.to === 'boss')).toHaveLength(3);
    expect(messages.find((m) => m.text.includes('Yo‘qotildi'))?.text).toContain('Sabab: Qimmat dedi');
  });

  it('keyingi qadam: natija tarixga yoziladi; muddat o‘zgarishi — sabab bilan, rahbarga xabar', async () => {
    const ref = `/api/v1/deals/${dealIds[0]}`;
    await http().patch(ref).set(as('sales')).send({ nextStep: '' }).expect(400);
    await http().patch(ref).set(as('sales')).send({ nextStep: 'KP yuborish', nextStepAt: inHour(24), stepResult: 'Gaplashdik, KP so‘radi' }).expect(200);

    await http().patch(ref).set(as('sales')).send({ dueDate: '2026-12-20' }).expect(200); // birinchi marta — sababsiz
    await http().patch(ref).set(as('sales')).send({ dueDate: '2026-12-30' }).expect(400);
    await http().patch(ref).set(as('sales')).send({ dueDate: '2026-12-30', dueReason: 'Mijoz dizaynni kech berdi' }).expect(200);
    await http().patch(ref).set(as('sales')).send({ amount: '140000000' }).expect(200);

    const detail = await http().get(ref).set(as('boss')).expect(200);
    const kinds = detail.body.activities.map((a: { kind: string }) => a.kind);
    expect(kinds).toEqual(['created', 'stage', 'stage', 'stage', 'step', 'due', 'due', 'amount']);
    expect(detail.body.activities[4]).toMatchObject({ from: 'Qo‘ng‘iroq qilish', to: 'KP yuborish', body: 'Gaplashdik, KP so‘radi' });
    expect(detail.body.activities[6]).toMatchObject({ from: '2026-12-20', to: '2026-12-30', body: 'Mijoz dizaynni kech berdi' });
    expect(detail.body.activities[7]).toMatchObject({ from: '150000000 UZS', to: '140000000 UZS' });

    await flush();
    const dueMessages = sent().filter((m) => m.text.includes('muddatini o‘zgartirdi'));
    expect(dueMessages.map((m) => m.to)).toEqual(['boss', 'boss']);
    expect(dueMessages[1].text).toContain('Sabab: Mijoz dizaynni kech berdi');
  });

  it('tarixga qo‘ng‘iroq va fayl (TZ) qo‘shiladi', async () => {
    const ref = `/api/v1/deals/${dealIds[0]}/activities`;
    await http().post(ref).set(as('sales')).send({ kind: 'call', body: '' }).expect(400);
    const res = await http()
      .post(ref)
      .set(as('sales'))
      .field('kind', 'meeting')
      .field('body', 'Ofisda uchrashdik')
      .attach('files', Buffer.from('Texnik topshiriq'), 'tz.txt')
      .expect(201);
    expect(res.body).toMatchObject({ kind: 'meeting', body: 'Ofisda uchrashdik' });
    expect(res.body.attachments).toEqual([expect.objectContaining({ fileName: 'tz.txt', kind: 'file' })]);
    await http().post(ref).set(as('sales2')).send({ kind: 'note', body: 'begona' }).expect(404);
  });

  it('eslatma: vaqti kelganda mas’ulga, 24 soatdan keyin rahbarga; qadam yangilansa — qaytadan', async () => {
    const job = app.get(DealStepJob);
    const id = dealIds[0];
    await prisma.deal.update({ where: { id }, data: { nextStepAt: new Date(Date.now() - 60_000) } });
    // Ikkinchi kelishuvning qadami uzoqda: 25 soatlik "sakrash"da u xalaqit bermasin.
    await prisma.deal.update({ where: { id: dealIds[1] }, data: { nextStepAt: new Date(Date.now() + 100 * 3_600_000) } });
    await job.run();
    await job.run(); // takrorlanmaydi
    await flush();
    expect(sent()).toEqual([expect.objectContaining({ to: 'sales', text: expect.stringContaining('keyingi qadam vaqti keldi') })]);

    await job.run(new Date(Date.now() + 25 * 3_600_000));
    await flush();
    expect(sent()).toEqual([expect.objectContaining({ to: 'boss', text: expect.stringContaining('qotib qoldi') })]);

    await http().patch(`/api/v1/deals/${id}`).set(as('sales')).send({ nextStep: 'Shartnoma yuborish', nextStepAt: inHour(-1), stepResult: 'KP yubordim' }).expect(200);
    const fresh = await prisma.deal.findUniqueOrThrow({ where: { id } });
    expect(fresh.stepRemindedAt).toBeNull();
    expect(fresh.stepEscalatedAt).toBeNull();
    await job.run();
    await flush();
    expect(sent()).toEqual([expect.objectContaining({ to: 'sales', text: expect.stringContaining('Shartnoma yuborish') })]);
  });

  it('to‘lovlar: plastik — chek bilan, darhol; naqd — rahbar tasdiqlaydi; avans yetgach rahbarga “boshlaymizmi?”', async () => {
    const id = dealIds[0]; // 140 000 000 so'm, avans 50% = 70 mln
    const pay = (w: Who, fields: Record<string, string>, file = true) => {
      const req = http().post(`/api/v1/deals/${id}/payments`).set(as(w));
      for (const [k, v] of Object.entries(fields)) req.field(k, v);
      if (file) req.attach('files', Buffer.from('chek'), 'chek.jpg');
      return req;
    };
    await pay('sales', { amount: '30000000', method: 'CARD' }, false).expect(400); // chek yo'q
    await pay('sales2', { amount: '1', method: 'CARD' }).expect(404); // begona kelishuv
    await pay('sales', { amount: '30000000', method: 'CARD', paidAt: '2099-01-01' }).expect(400);

    const card = await pay('sales', { amount: '30 000 000', method: 'CARD', kind: 'ADVANCE' }).expect(201);
    expect(card.body).toMatchObject({ status: 'CONFIRMED', method: 'CARD', amount: '30000000', currency: 'UZS' });
    expect(card.body.receipts).toHaveLength(1);
    const cash = await pay('sales', { amount: '40000000', method: 'CASH', note: 'Ofisda berdi' }, false).expect(201);
    expect(cash.body.status).toBe('PENDING');

    let deal = await http().get(`/api/v1/deals/${id}`).set(as('sales')).expect(200);
    expect(deal.body).toMatchObject({ paid: '30000000', pendingPayments: '40000000', advanceDue: '70000000', advanceReached: false });
    await flush();
    let messages = sent();
    expect(messages.filter((m) => m.to === 'boss').map((m) => m.text.split('\n')[0])).toEqual(['💳 Plastik to‘lov tushdi', '💵 Naqd to‘lov — tasdiqlang']);
    expect(messages.find((m) => m.text.includes('Naqd'))?.text).toContain('Izoh: Ofisda berdi');
    const button = telegram.sent.length; // (sent() tozaladi) tugma alohida tekshiriladi pastda
    expect(button).toBe(0);

    await http().post(`/api/v1/deals/payments/${cash.body.id}/confirm`).set(as('sales')).expect(403);
    await http().post(`/api/v1/deals/payments/${card.body.id}/confirm`).set(as('boss')).expect(400); // plastik tasdiq talab qilmaydi
    const confirmed = await http().post(`/api/v1/deals/payments/${cash.body.id}/confirm`).set(as('boss')).expect(201);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', confirmedBy: { userId: users.boss.id } });
    await http().post(`/api/v1/deals/payments/${cash.body.id}/confirm`).set(as('boss')).expect(400);

    deal = await http().get(`/api/v1/deals/${id}`).set(as('sales')).expect(200);
    expect(deal.body).toMatchObject({ paid: '70000000', remaining: '70000000', advanceReached: true });
    await flush();
    messages = sent();
    expect(messages.find((m) => m.to === 'sales')?.text).toContain('naqd to‘lovni tasdiqladi');
    expect(messages.filter((m) => m.to === 'boss' && m.text.includes('loyihani boshlaymizmi'))).toHaveLength(1);

    // Rad etish — sabab bilan, savdochiga xabar.
    const bad = await pay('sales', { amount: '5000000', method: 'CASH' }, false).expect(201);
    await http().post(`/api/v1/deals/payments/${bad.body.id}/reject`).set(as('boss')).send({}).expect(400);
    const rejected = await http().post(`/api/v1/deals/payments/${bad.body.id}/reject`).set(as('boss')).send({ reason: 'Pul kassaga tushmagan' }).expect(201);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Pul kassaga tushmagan' });
    await flush();
    expect(sent().find((m) => m.to === 'sales' && m.text.includes('rad etdi'))?.text).toContain('Sabab: Pul kassaga tushmagan');

    const list = await http().get(`/api/v1/deals/${id}/payments`).set(as('boss')).expect(200);
    expect(list.body.map((p: { status: string }) => p.status)).toEqual(['CONFIRMED', 'CONFIRMED', 'REJECTED']);
    await http().patch(`/api/v1/deals/${id}`).set(as('sales')).send({ currency: 'USD' }).expect(400); // to'lovlar bor
  });

  it('naqd to‘lov xabarida rahbarga “✅ Tasdiqlash” tugmasi', async () => {
    const res = await http().post(`/api/v1/deals/${dealIds[0]}/payments`).set(as('sales')).field('amount', '1000').field('method', 'CASH').expect(201);
    await flush();
    const msg = telegram.sent.splice(0).find((m) => Number(m.chatId) === tg.boss);
    expect(msg?.message.buttons.flat()).toEqual(expect.arrayContaining([{ text: '✅ Tasdiqlash', callbackData: `pay:${res.body.id}:ok` }]));
    await http().post(`/api/v1/deals/payments/${res.body.id}/reject`).set(as('boss')).send({ reason: 'test' }).expect(201);
    await flush();
    telegram.sent.length = 0;
  });

  it('loyihani boshlash: faqat rahbar, avans yetgach; teamlead — mas’ul, narx loyihaga o‘tmaydi, mijozga havola', async () => {
    const key = `D${run}`.slice(0, 10);
    await http().post(`/api/v1/deals/${dealIds[1]}/start`).set(as('boss')).send({ key }).expect(400); // avans yo'q
    await http().post(`/api/v1/deals/${dealIds[0]}/start`).set(as('sales')).send({ key }).expect(403);
    await http().post(`/api/v1/deals/${dealIds[0]}/start`).set(as('boss')).send({ key: '1x' }).expect(400);

    const res = await http().post(`/api/v1/deals/${dealIds[0]}/start`).set(as('boss')).send({ key, inviteClient: true }).expect(201);
    expect(res.body.project).toMatchObject({ key, name: `USTA do‘kon ${run}` });
    expect(res.body.clientInviteLink).toMatch(/^https:\/\/t\.me\/liveportal_test_bot\?start=inv_/);
    await http().post(`/api/v1/deals/${dealIds[0]}/start`).set(as('boss')).send({ key: `E${run}`.slice(0, 10) }).expect(409);

    const deal = await http().get(`/api/v1/deals/${dealIds[0]}`).set(as('sales')).expect(200);
    expect(deal.body).toMatchObject({ stage: 'WON', project: { id: res.body.project.id, key } });
    expect(deal.body.activities.at(-1)).toMatchObject({ kind: 'won', to: key });
    await http().patch(`/api/v1/deals/${dealIds[0]}`).set(as('sales')).send({ stage: 'DISCUSSION' }).expect(400);

    // Loyihada teamlead — kelishuv mas'uli; tavsifda narx yo'q.
    const project = await http().get(`/api/v1/projects/${res.body.project.id}`).set(as('sales')).expect(200);
    expect(project.body.members).toEqual([expect.objectContaining({ userId: users.sales.id, role: 'teamlead' })]);
    expect(JSON.stringify(project.body)).not.toContain('140000000');

    // Mijoz havolani ochsa — loyihaga "Mijoz" (guest) bo'lib qo'shiladi.
    const token = /inv_([A-Za-z0-9_-]+)/.exec(res.body.clientInviteLink)![1];
    const accepted = await app.get(InvitesService).accept(token, { id: base + 9, first_name: 'Akmal', last_name: 'aka', auth_date: 0, hash: '' } as never);
    extraUsers.push(accepted.userId);
    expect(accepted.role).toBe('client');
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: res.body.project.id, userId: accepted.userId } }, include: { role: true } });
    expect(member?.role.name).toBe('guest');

    await flush();
    const messages = sent();
    expect(messages.find((m) => m.to === 'sales' && m.text.includes('Yutildi'))).toBeTruthy();
    expect(messages.find((m) => m.to === 'sales' && m.text.includes('loyihasiga qo‘shdi'))).toBeTruthy();
  });
});
