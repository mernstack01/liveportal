# 04 — Arxitektura

## Umumiy ko'rinish

```
            ┌──────────────┐      ┌──────────────────┐
            │  Next.js Web │      │  Telegram Bot    │
            │  (portal UI) │      │  (grammY)        │
            └──────┬───────┘      └────────┬─────────┘
                   │ REST / WS             │ commands, inline buttons
                   ▼                       ▼
        ┌─────────────────────────────────────────────┐
        │              NestJS API (modular monolith)   │
        │  auth · workspace · project · task · comms   │
        │  notification · integration · analytics      │
        │                                              │
        │        ┌──── Domain Event Bus ────┐          │
        │        │  (in-process EventEmitter │          │
        │        │   + Outbox → BullMQ)      │          │
        │        └───────────────────────────┘          │
        └───────┬───────────────────────┬──────────────┘
                ▼                       ▼
         PostgreSQL (Prisma)      Redis (BullMQ, cache, WS pub/sub)
                                        │
                                        ▼
                              Workers: notifications,
                              scheduled jobs (due/overdue),
                              telegram delivery
```

## Asosiy qarorlar

| Qaror | Tanlov | Sabab |
|-------|--------|-------|
| Mikroservis yoki monolit? | **Modulli monolit** | Kichik jamoa; modullar chegarasi aniq bo'lsa, keyin ajratish oson |
| Modullar aloqasi | **Domain eventlar** orqali | Notification, audit, analitika task moduliga bog'lanmaydi → yangi modul = yangi subscriber |
| Eventlar ishonchliligi | **Transactional Outbox** | Task saqlandi-yu, notification yo'qolib qolmasligi uchun |
| Fon ishlari | **BullMQ** | Telegram yetkazish, retry, rate-limit, cron (overdue tekshiruvi) |
| Real-time | **WebSocket (Socket.IO) + Redis adapter** | Xabarlar, task o'zgarishlari jonli |
| Bot kutubxonasi | **grammY** | TypeScript, middleware, conversations plugin |
| Auth | Telegram Login + email/parol (ixtiyoriy), JWT + refresh | Mentorlar asosan Telegram'da |
| Repo | **Monorepo (pnpm + Turborepo)** | api, web, bot, shared types bitta joyda |

## Moslashuvchanlik qoidalari (keyingi muammolar uchun)

1. **Modul faqat o'z jadvallariga yozadi.** Boshqa modulga ta'sir — faqat event yoki public service orqali.
2. **Yangi funksiya = yangi event subscriber** (iloji boricha). Masalan, "task Done bo'lsa mijozga xabar yubor" — task moduliga tegmasdan, automation modulida.
3. **Notification kanallari — strategy pattern.** `NotificationChannel` interfeysi: `telegram`, `in_app`, keyin `email`, `push`, `sms`.
4. **Integratsiyalar — adapter pattern.** GitHub, Google Calendar, AI-provayderlar `integrations/` ostida, yadro ularni bilmaydi.
5. **Feature flags** workspace darajasida — yangi modulni bosqichma-bosqich yoqish.
6. **Public API birinchi.** Web va bot bir xil API'dan foydalanadi → keyin mobil ilova ham.

## Telegram bot rollari

- **Shaxsiy notification**: "Sizga yangi task: LP-42 — Login sahifasi" + `[Ko'rish] [Qabul qildim] [Boshladim]` tugmalari.
- **Tezkor amallar**: `/mytasks`, `/today`, `/new` (task yaratish), statusni tugma bilan o'zgartirish.
- **Loyiha guruhi bilan bog'lash**: loyiha `Channel` ↔ Telegram guruh/topic; muhim eventlar guruhga ham tushadi.
- **Kunlik digest**: ertalab har bir odamga bugungi va muddati o'tgan tasklar.
- **Tashqi xabarlar**: mijoz bot yoki guruhga yozadi → portalda `external` kanalga tushadi (❓ 07).

## Monorepo strukturasi (reja)

```
liveportal/
├── apps/
│   ├── api/          # NestJS
│   ├── web/          # Next.js
│   ├── bot/          # grammY (API'ga HTTP/queue orqali ulanadi)
│   └── worker/       # BullMQ workers (yoki api ichida alohida process)
├── packages/
│   ├── db/           # Prisma schema + client
│   ├── shared/       # types, zod schemas, event nomlari
│   └── config/       # eslint, tsconfig
├── docs/
└── docker-compose.yml  # postgres, redis
```
