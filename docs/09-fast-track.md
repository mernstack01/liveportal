# 09 — Fast track: 2 haftada ishlaydigan MVP

> Maqsad: 10 ish kunida bitta real loyiha portal orqali boshqarilsin va tasklar haqida Telegram'ga xabar kelsin.
> Bu hujjat [06-roadmap.md](06-roadmap.md) dagi Faza 1 ni qisqartiradi. Hammasi taklif, tasdiqlanishi kerak.

## 1. Nimani kesamiz (MVP-0 ga kirmaydi)

| Kesiladi | Nega | Qachon qaytadi |
|---|---|---|
| Email/parol, SMS | Mentorlar baribir Telegram'da | Kerak bo'lsa v1 |
| Subtask, dependency | Taskning o'zi ishlasa yetarli | v1 |
| Custom fields UI, workflow muharriri | Bazada bor, UI keyin. Har loyihaga 5 ta standart status seed qilinadi | v1 |
| Rol muharriri UI | 4 ta tizim roli seed qilinadi | v1 |
| Chat, kanallar, tashqi xabarlar | Avval tasklar portalga ko'chishi kerak | v1 |
| Fayllar (S3) | Task tavsifiga havola yetarli | v1 |
| Socket.IO real-time | Board'ni TanStack Query bilan 15 soniyada yangilash yetarli | v1 |
| Alohida `bot` va `worker` ilovalari | Bitta NestJS process ichida modul sifatida | Yuklama oshganda ajratiladi |

Sxemada bu jadvallar qolaveradi (`Channel`, `Message`, `TaskDependency`), lekin ular uchun kod yozilmaydi.

## 2. Stek: tezlik uchun soddalashtirish

```
liveportal/
├── apps/
│   ├── api/   NestJS 12: REST + grammY bot (webhook) + BullMQ worker + cron
│   └── web/   Vite + React + shadcn/ui + TanStack Query (web + Telegram Mini App)
├── packages/
│   └── shared/  zod sxemalar, event nomlari, permission string'lar
└── docker-compose.yml   postgres, redis
```

- **Skelet ZenStaff (`~/Desktop/Projects/zenstaff`) dan olinadi**: pnpm workspace, NestJS 12 ESM, Vitest, oxlint, docker-compose. Taxminan yarim kun tejaydi.
- **Web: Vite SPA** (Next.js emas). Bitta build ham oddiy brauzerda, ham Telegram Mini App ichida ochiladi. SSR va SEO kerak emas, xavfsizlik API'da.
- **Auth faqat Telegram:** web'da Telegram Login Widget, Mini App ichida `initData`. Backend imzoni bot tokeni bilan tekshiradi va JWT beradi. Taklif havolasi: `t.me/<bot>?start=inv_<token>`.
- **Outbox oddiy:** biznes amal va `Event` qatori bitta Prisma tranzaksiyasida yoziladi. Dispatcher har 2 soniyada `publishedAt IS NULL` qatorlarni `FOR UPDATE SKIP LOCKED` bilan olib, `EventBus` obunachilariga tarqatadi.
  - *4-kunda o'zgardi:* dispatcher BullMQ'siz, PostgreSQL'ning o'zida ishlaydi. Kafolati bir xil (bir nechta API nusxasida ham har event bir marta olinadi), lekin Redis'ga bog'liqlik yo'q. BullMQ 7-kunda Telegram'ga yuborish uchun kiradi: u yerda qayta urinish va rate-limit kerak.
- **Kanban:** `@dnd-kit` + shadcn. Board'ni noldan yozmaslik.
  - *5-kunda:* `@dnd-kit/core` ishlatildi; shadcn o'rniga bir nechta oddiy Tailwind komponent (`apps/web/src/components/ui.tsx`). Komponentlar ko'payganda shadcn qo'shiladi.

## 3. Kunma-kun reja

| Kun | Natija (ko'rinadigan) |
|---|---|
| 1 ✅ | Skelet, docker-compose, Prisma migration, seed (workspace, 4 rol, standart statuslar). `GET /health` |
| 2 ✅ | Telegram auth (Login Widget + Mini App), JWT, bot `/start` va taklif havolasi orqali akkaunt bog'lash |
| 3 ✅ | Project va a'zolar API, permission guard (`@RequirePermission`) |
| 4 ✅ | Task API: yaratish, tayinlash, status, muddat, prioritet, izoh, @mention. `Event` + outbox |
| 5 ✅ | Web: loyihalar ro'yxati, kanban board |
| 6 | Web: task drawer (tafsilot, izohlar), "Mening tasklarim" |
| 7 | Telegram bildirishnoma: tayinlandi, mention, izoh, Review'ga o'tdi. Tugmalar: `[Boshladim] [Review'ga] [Ochish]` |
| 8 | Cron: `due_soon`, `overdue`, ertalabki digest (09:00 Toshkent). Bot: `/mytasks`, `/today` |
| 9 | Rahbar dashboardi: loyihalar progressi (status `category` bo'yicha), kechikkan tasklar, mentor bo'yicha ochiq tasklar |
| 10 | VPS'ga deploy (docker compose + Caddy), pilot: 1 loyiha, 1 teamlead, 3–4 mentor |

11–15-kunlar: pilotdan kelgan fikrlar bo'yicha tuzatishlar, keyin v1 (chat).

## 4. Pilot va o'lchov

- Pilot boshida: loyihadagi barcha ochiq ishlar portalga kiritiladi (teamlead bilan 30 daqiqa).
- Har kuni bitta raqam: portalda yaratilgan tasklar soni va Telegram'da og'zaki berilgan tasklar soni (teamleaddan so'raladi).
- 1 haftadan keyin qaror: portal ishlatilyaptimi? Yo'q bo'lsa, sababini topamiz va keyingi modulga o'tmaymiz.

## 5. AI bilan tez ishlash

- Repo ildizida `CLAUDE.md`: modul shabloni ([05-modules.md](05-modules.md)), nomlash, test qoidalari. Har bir yangi modul shu shablon bo'yicha generatsiya qilinadi.
- Skelet tayyor bo'lgach, mustaqil ishlarni parallel sessiyalarga bo'lish mumkin: `task` moduli (api), kanban (web), bot (api/telegram). Ular har xil fayllarga tegadi.
- Har modul uchun avval e2e test (task yaratildi → Event yozildi → notification job tushdi), keyin UI.

## 6. Xavflar

| Xavf | Belgisi | Chora |
|---|---|---|
| Mentorlar portalga kirmaydi | Pilotda tasklar baribir Telegram'da | Hamma amal botdan ham qilinadi, portal ixtiyoriy ko'rinish |
| Bildirishnoma shovqini | Odamlar botni o'chirib qo'yadi | Faqat 5 ta event darhol, qolgani digest'da ([07](07-open-questions.md), 10-savol) |
| Scope o'sishi | "Chat ham qo'shaylik" | Har yangi g'oya `08-ideas-backlog.md` ga, MVP-0 tugamaguncha qo'shilmaydi |
| Telegram webhook uchun HTTPS kerak | Lokal test qiyin | Lokalda long polling, prod'da webhook |
