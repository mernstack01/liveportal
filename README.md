# LivePortal

> IT Live Academy uchun ichki boshqaruv portali — mentorlar AI bilan qiladigan loyihalarni, tasklarni, jamoalarni va kommunikatsiyani bitta joyda boshqarish.

**Holat:** 🟢 MVP-0, 9-kun tayyor, deploy fayllari tayyor (server kutilmoqda): rahbar dashboardi; Telegram orqali kirish, loyihalar va tasklar (API + web: kanban, task paneli, "Mening tasklarim"), Telegram bildirishnomalari tugmalar bilan, ertalabki xulosa va bot buyruqlari `/today`, `/mytasks`. Reja: [docs/09-fast-track.md](docs/09-fast-track.md)

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
3. Birinchi rahbar uchun havola: `pnpm --filter @liveportal/api invite:create owner "Ism"` (liveportal papkasida). Havolani oching va Start bosing. Bot tanimasa (chat avval ochilgan bo'lsa, Telegram kodni yubormaydi), havolani chatga oddiy xabar qilib yuboring.
4. Lokal web'ga kirish: `DEV_LOGIN=true` bo'lsa login sahifasida Telegram ID bilan kirasiz (Telegram Login Widget localhost'da ishlamaydi).
5. Production'da: @BotFather → `/setdomain` (Login Widget uchun) va Mini App URL'i.

Keyingi odamlarni portaldagi "Odam taklif qilish" bo'limidan taklif qilasiz. Har havola bir martalik va 7 kun amal qiladi.

Tekshiruvlar: `pnpm test`, `pnpm --filter @liveportal/api test:e2e`, `pnpm lint`, `pnpm build`.
E2e testlar alohida `liveportal_test` bazasida ishlaydi (avtomatik yaratiladi), ishlab chiqish bazasiga tegmaydi. `pnpm build` ni `pnpm dev` ishlab turganda ishga tushirmang: build `dist` ni o'chiradi va dev API to'xtaydi.

Jonli namoyish (demo jamoa, kirish ID'lari, o'chirish buyrug'i): [docs/demo.md](docs/demo.md). Demo video: `docs/media/liveportal-demo.mp4` (git'da emas).

## API (`/api/v1`)

| Endpoint | Ruxsat |
|---|---|
| `GET /projects` (`?archived=true`) | workspace a'zosi; `dashboard.view_all` bo'lsa hamma loyihalar, bo'lmasa faqat o'zinikilar |
| `POST /projects` | `project.create`. Yaratuvchi teamlead bo'ladi, 5 ta standart status qo'shiladi |
| `GET /projects/:projectId` | loyiha a'zosi yoki `dashboard.view_all`, aks holda 404 |
| `PATCH /projects/:projectId` | `project.update`; arxivlash uchun `project.archive` ham |
| `POST /projects/:projectId/members` | `project.member.manage`; o'zidan yuqori rol berib bo'lmaydi |
| `PATCH`/`DELETE /projects/:projectId/members/:userId` | `project.member.manage`; o'zini o'zgartirib bo'lmaydi |
| `GET /workspace/members` | workspace a'zosi |
| `GET /projects/:projectId/tasks` (`?assignee=me`, `?statusId=`) | loyihani ko'ra oladigan odam |
| `POST /projects/:projectId/tasks` | `task.create`; bajaruvchi berilsa `task.assign` ham. Bajaruvchi faqat loyiha a'zosi |
| `GET /projects/:projectId/tasks/:taskRef` | task id yoki raqami (`LP-12` uchun `12`), izohlar bilan |
| `PATCH /projects/:projectId/tasks/:taskRef` | maydon bo'yicha: `task.update`, `task.assign`; Done'ga o'tkazish yoki qaytarish `task.close` |
| `POST /projects/:projectId/tasks/:taskRef/comments` | `task.comment`; `@username` faqat loyiha a'zolari uchun ishlaydi |
| `GET /tasks/mine` (`?all=true`) | barcha loyihalardagi menga berilgan ochiq tasklar |
| `GET /dashboard` | `dashboard.view_all`: loyihalar progressi, kechikkan tasklar, odamlar yuklamasi, bu hafta yopilganlar |

Loyihadagi ruxsat = workspace roli + loyiha roli. Arxivdagi loyihada task yaratib ham, izoh yozib ham bo'lmaydi (409).

**Telegram bildirishnomalari:**

| Hodisa | Kimga |
|---|---|
| Task berildi | bajaruvchiga (tugmalar: ▶️ Boshladim, 👀 Review'ga, Ochish) |
| Izohda @mention | belgilangan odamga |
| Izoh | bajaruvchi va muallifga (shu izohda mention qilinganlarga emas) |
| Review'ga o'tdi | muallif va loyihadagi `task.close` egalariga (teamlead) |
| Loyihaga qo'shildi | qo'shilgan odamga |
| Muddati o'tdi (ertalabki ish) | muallif va teamleadlarga (bajaruvchi buni xulosadan biladi) |
| Ertalabki xulosa, 09:00 Toshkent | muddati o'tgan / bugun / ertaga taski bor har bir odamga, bitta xabar |

Hech kimga o'zi qilgan ish haqida xabar kelmaydi. Ertalabki ish (`MorningJob`) kuniga bir marta bajariladi (`JobRun`): server 09:00 da o'chiq bo'lsa, yoqilganda o'sha kun uchun bajariladi. Bot: `/today`, `/mytasks`, `/help`. Navbat `Notification` jadvalida: qatorlar event bilan bir tranzaksiyada yoziladi, `NotificationSender` har `NOTIFY_POLL_MS` da yuboradi (429 da kutadi, tarmoq xatosida 5 marta qayta urinadi, bot bloklangan bo'lsa `failed`). "Ochish" tugmasi faqat `WEB_ORIGIN` https bo'lganda chiqadi.

**Eventlar (outbox):** har o'zgarish `Event` jadvaliga o'sha tranzaksiyada yoziladi. `OutboxDispatcher` har `OUTBOX_POLL_MS` (2 soniya) da `publishedAt IS NULL` eventlarni `FOR UPDATE SKIP LOCKED` bilan olib, `EventBus` obunachilariga tarqatadi. Modul eventga shunday obuna bo'ladi: `eventBus.subscribe('task.assigned', 'nom', handler)`.

## Keyingi qadam

10-kun: serverga deploy — qadamma-qadam [deploy/README.md](deploy/README.md) da (docker compose + Caddy, HTTPS, zaxira). Keyin pilot: 1 loyiha, 1 teamlead, 3–4 mentor.
