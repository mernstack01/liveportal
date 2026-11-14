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

type Who = 'lead' | 'dev' | 'guest' | 'outsider';

class FakeTelegram extends TelegramGateway {
  sent: { chatId: string; message: RenderedMessage }[] = [];
  async send(chatId: string, message: RenderedMessage) {
    this.sent.push({ chatId, message });
  }
}

describe('Ichki chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const telegram = new FakeTelegram();
  const run = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = 9_300_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const tg: Record<Who, number> = { lead: base + 1, dev: base + 2, guest: base + 3, outsider: base + 4 };
  const username = (who: Who) => `e2e_${who}_${run.toLowerCase()}`;
  const users = {} as Record<Who, { id: string; token: string }>;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${users[who].token}` });
  const chat = () => `/api/v1/projects/${projectId}/chat`;
  const flush = async () => {
    await app.get(OutboxDispatcher).drain();
    await app.get(NotificationSender).drain();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TelegramGateway).useValue(telegram).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const workspaceId = (await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } })).id;
    const member = await prisma.role.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId, name: 'member' } } });
    for (const who of ['lead', 'dev', 'guest', 'outsider'] as Who[]) {
      const user = await prisma.user.create({ data: { name: `E2E ${who}`, telegramId: BigInt(tg[who]), telegramUsername: username(who) } });
      await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: member.id } });
      users[who] = { id: user.id, token: await jwt.signAsync({ sub: user.id }) };
    }
    const project = await http().post('/api/v1/projects').set(as('lead')).send({ key: `C${run}`, name: 'Chat e2e' }).expect(201);
    projectId = project.body.id;
    await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.dev.id }).expect(201);
    await http().post(`/api/v1/projects/${projectId}/members`).set(as('lead')).send({ userId: users.guest.id, role: 'guest' }).expect(201);
    await flush();
    telegram.sent.splice(0);
  });

  afterAll(async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const channels = await prisma.channel.findMany({ where: { projectId }, select: { id: true } });
    const messageIds = (await prisma.message.findMany({ where: { channelId: { in: channels.map((c) => c.id) } }, select: { id: true } })).map((m) => m.id);
    const events = await prisma.event.findMany({ where: { entityId: { in: [projectId, ...messageIds] } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: userIds } }] } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.attachment.deleteMany({ where: { messageId: { in: messageIds } } });
    await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    await prisma.channel.deleteMany({ where: { projectId } });
    await prisma.workflowStatus.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('dasturchi yozadi, teamlead o‘qiydi; mehmon ko‘rmaydi va yoza olmaydi; begonaga 404', async () => {
    await http().post(chat()).set(as('dev')).send({ body: 'Salom jamoa!' }).expect(201);
    const res = await http().get(chat()).set(as('lead')).expect(200);
    expect(res.body).toMatchObject({ canWrite: true, hasMore: false });
    expect(res.body.messages).toEqual([expect.objectContaining({ body: 'Salom jamoa!', author: expect.objectContaining({ userId: users.dev.id }) })]);

    await http().get(chat()).set(as('guest')).expect(403);
    await http().post(chat()).set(as('guest')).send({ body: 'Men ham' }).expect(403);
    await http().get(chat()).set(as('outsider')).expect(404);
    await http().post(chat()).set(as('dev')).send({ body: '   ' }).expect(400);
  });

  it('@mention: faqat chatni ko‘ra oladigan a’zoga Telegram xabari', async () => {
    await http().post(chat()).set(as('lead')).send({ body: `@${username('dev')} va @${username('guest')}, reliz bugun 18:00 da` }).expect(201);
    await flush();
    const sent = telegram.sent.splice(0);
    expect(sent.map((s) => s.chatId)).toEqual([String(tg.dev)]);
    expect(sent[0].message.text).toContain('sizni <b>Chat e2e</b> chatida belgiladi');
    expect(sent[0].message.text).toContain('reliz bugun 18:00 da');
  });

  it('eski xabarlar sahifalab yuklanadi', async () => {
    for (let i = 1; i <= 52; i++) await http().post(chat()).set(as('dev')).send({ body: `xabar ${i}` }).expect(201);
    const last = await http().get(chat()).set(as('lead')).expect(200);
    expect(last.body.messages).toHaveLength(50);
    expect(last.body.hasMore).toBe(true);
    expect(last.body.messages.at(-1).body).toBe('xabar 52');
    const older = await http().get(`${chat()}?before=${last.body.messages[0].id}`).set(as('lead')).expect(200);
    expect(older.body.messages.map((m: { body: string }) => m.body)).toEqual(['Salom jamoa!', expect.stringContaining('reliz'), 'xabar 1', 'xabar 2']);
    expect(older.body.hasMore).toBe(false);
  });

  it('arxivdagi loyihada yozib bo‘lmaydi', async () => {
    await http().patch(`/api/v1/projects/${projectId}`).set(as('lead')).send({ status: 'ARCHIVED' }).expect(200);
    await http().post(chat()).set(as('dev')).send({ body: 'kech qoldim' }).expect(409);
  });

  describe('fayllar', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a10000000049454e44ae426082', 'hex');
    let imageUrl: string;
    let pdfUrl: string;

    beforeAll(async () => {
      // Oldingi test loyihani arxivladi — fayl testlari uchun qaytaramiz.
      await http().patch(`/api/v1/projects/${projectId}`).set(as('lead')).send({ status: 'ACTIVE' }).expect(200);
    });

    it('matn + rasm + PDF bitta xabarda; nomlar o‘zbekcha saqlanadi', async () => {
      const res = await http()
        .post(chat())
        .set(as('dev'))
        .field('body', 'Skrinshot va hisobot')
        .attach('files', png, { filename: 'to‘lov xatosi.png', contentType: 'image/png' })
        .attach('files', Buffer.from('%PDF-1.7 hisobot'), { filename: 'Hisobot.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(res.body.body).toBe('Skrinshot va hisobot');
      expect(res.body.attachments).toEqual([
        expect.objectContaining({ fileName: 'to‘lov xatosi.png', kind: 'image', mimeType: 'image/png', size: png.length }),
        expect.objectContaining({ fileName: 'Hisobot.pdf', kind: 'file', mimeType: 'application/pdf' }),
      ]);
      [imageUrl, pdfUrl] = res.body.attachments.map((a: { url: string }) => a.url);
    });

    it('imzolangan havola: rasm brauzerda, PDF faqat yuklab olinadi; imzosiz yoki buzilgan — 403', async () => {
      const img = await http().get(imageUrl).expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      expect(img.headers['content-disposition']).toMatch(/^inline;/);
      expect(img.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(img.body).equals(png)).toBe(true);

      const pdf = await http().get(pdfUrl).buffer(true).expect(200);
      expect(pdf.headers['content-type']).toBe('application/octet-stream');
      expect(pdf.headers['content-disposition']).toMatch(/^attachment;/);

      const id = imageUrl.split('/files/')[1].split('?')[0];
      await http().get(`/api/v1/files/${id}`).expect(403);
      await http().get(imageUrl.replace(/sig=[^&]+/, 'sig=buzilgan')).expect(403);
      await http().get(imageUrl.replace(/exp=\d+/, 'exp=1')).expect(403);
    });

    it('rasm deb nomlangan HTML rasm sifatida berilmaydi (XSS himoyasi)', async () => {
      const res = await http()
        .post(chat())
        .set(as('dev'))
        .attach('files', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'surat.png', contentType: 'image/png' })
        .expect(201);
      expect(res.body.body).toBe('');
      expect(res.body.attachments[0]).toMatchObject({ kind: 'file' });
      const file = await http().get(res.body.attachments[0].url).buffer(true).expect(200);
      expect(file.headers['content-type']).toBe('application/octet-stream');
    });

    it('mehmon fayl yubora olmaydi; ro‘yxatda fayllar havola bilan keladi; mention xabarida fayl soni', async () => {
      await http().post(chat()).set(as('guest')).attach('files', png, 'x.png').expect(403);

      await http().post(chat()).set(as('lead')).field('body', `@${username('dev')} qarang`).attach('files', png, 'a.png').expect(201);
      await flush();
      const sent = telegram.sent.splice(0);
      expect(sent.find((s) => s.chatId === String(tg.dev))?.message.text).toContain('📎 1 ta fayl');

      const list = await http().get(chat()).set(as('dev')).expect(200);
      const last = list.body.messages.at(-1);
      expect(last.attachments[0].url).toMatch(/^\/api\/v1\/files\/.+\?exp=\d+&sig=/);
    });
  });
});
