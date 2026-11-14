# LivePortal

> IT Live Academy uchun ichki boshqaruv portali — mentorlar AI bilan qiladigan loyihalarni, tasklarni, jamoalarni va kommunikatsiyani bitta joyda boshqarish.

**Holat:** 🟢 MVP-0, 2-kun tayyor: Telegram orqali kirish (Login Widget, Mini App), taklif havolalari, bot `/start`. Reja: [docs/09-fast-track.md](docs/09-fast-track.md)

## Muammo (qisqa)

IT Live'da mentorlar AI yordamida loyihalar qilishadi, lekin:

- loyihalar va ularning holati bitta joyda ko'rinmaydi;
- rahbar / teamlead task berish, kuzatish va nazorat qilishni tartibli qila olmaydi;
- mentorlar o'rtasidagi o'zaro tasklar va jarayonlar tarqoq (Telegram, og'zaki, turli chatlar);
- ichki va tashqi (mijoz, hamkor) xabarlar aralash ketadi;
- muhim hodisalar haqida o'z vaqtida xabar (notification) kelmaydi.

## Yechim (qisqa)

Modulli portal: **Workspace → Project → Task** iyerarxiyasi, rollar va ruxsatlar, ichki/tashqi xabarlar, Telegram bot orqali bildirishnomalar. Yadro **hodisalarga asoslangan (event-driven)** — keyingi muammolar uchun yangi modul qo'shish mavjud kodni buzmasligi kerak.

## Hujjatlar

| # | Fayl | Nima haqida |
|---|------|-------------|
| 1 | [docs/01-vision.md](docs/01-vision.md) | Muammo, maqsad, muvaffaqiyat mezonlari, scope |
| 2 | [docs/02-roles-permissions.md](docs/02-roles-permissions.md) | Rollar va kim nima qila oladi |
| 3 | [docs/03-domain-model.md](docs/03-domain-model.md) | Asosiy obyektlar va ular orasidagi bog'liqlik |
| 4 | [docs/04-architecture.md](docs/04-architecture.md) | Texnik arxitektura, moslashuvchanlik prinsiplari |
| 5 | [docs/05-modules.md](docs/05-modules.md) | Modullar ro'yxati va ularning chegaralari |
| 6 | [docs/06-roadmap.md](docs/06-roadmap.md) | Bosqichlar: MVP → v1 → keyingi |
| 7 | [docs/07-open-questions.md](docs/07-open-questions.md) | Javob kerak bo'lgan savollar (eng muhimi!) |
| 8 | [docs/08-ideas-backlog.md](docs/08-ideas-backlog.md) | Miyadagi qolgan 95% uchun joy |
| 9 | [docs/09-fast-track.md](docs/09-fast-track.md) | 2 haftalik MVP-0 rejasi: nima kesiladi, kunma-kun |
| — | [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma) | Ma'lumotlar bazasi sxemasi |

## Stack (rejadagi)

NestJS + TypeScript · PostgreSQL + Prisma · Redis + BullMQ · Vite + React (web + Telegram Mini App, taklif: [09](docs/09-fast-track.md)) · grammY (Telegram bot) · keyinchalik React Native/Expo (mobil)

## Ishga tushirish

Talablar: Node 24, pnpm 11, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm infra:up        # Postgres :5434, Redis :6381
pnpm --filter @liveportal/shared build
pnpm db:migrate      # migration + Prisma client
pnpm db:seed         # IT Live workspace va 6 ta tizim roli
pnpm dev             # api :4100, web :5173
```

| Ilova | Papka | Manzil |
|---|---|---|
| API (NestJS) | `apps/api` | http://localhost:4100/api/v1/health |
| Web (Vite + React) | `apps/web` | http://localhost:5173 (`/api` API'ga proxy qilinadi) |
| Umumiy kod | `packages/shared` | rollar, ruxsatlar, standart workflow, event nomlari |

## Birinchi kirish (Telegram)

1. @BotFather → `/newbot`. Token va username'ni `apps/api/.env` ga yozing: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`. Tokenni hech kimga yubormang.
2. `pnpm dev` ni qayta ishga tushiring. Logda `Bot ishga tushdi: @...` chiqishi kerak.
3. Birinchi rahbar uchun havola: `pnpm --filter @liveportal/api invite:create owner "Ism"`. Havolani oching, bot sizni workspace'ga qo'shadi.
4. Lokal web'ga kirish: `DEV_LOGIN=true` bo'lsa login sahifasida Telegram ID bilan kirasiz (Telegram Login Widget localhost'da ishlamaydi).
5. Production'da: @BotFather → `/setdomain` (Login Widget uchun) va Mini App URL'i.

Keyingi odamlarni portaldagi "Odam taklif qilish" bo'limidan taklif qilasiz. Har havola bir martalik va 7 kun amal qiladi.

Tekshiruvlar: `pnpm test`, `pnpm --filter @liveportal/api test:e2e`, `pnpm lint`, `pnpm build`.

## Keyingi qadam

`docs/09-fast-track.md` bo'yicha 3-kun: loyihalar va a'zolar API, loyiha darajasidagi ruxsatlar.
