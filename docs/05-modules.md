# 05 — Modullar

| Modul | Mas'uliyati | Emit qiladi | Tinglaydi | Bosqich |
|-------|-------------|-------------|-----------|---------|
| **auth** | Login (Telegram, email), JWT, sessiya | `user.logged_in` | — | MVP |
| **workspace** | Workspace, a'zolar, rollar, permissionlar, teamlar | `member.invited`, `member.role_changed` | — | MVP |
| **project** | Loyihalar, a'zolar, workflow, custom fields | `project.*` | — | MVP |
| **task** | Tasklar, subtask, dependency, izohlar, fayllar | `task.*` | — | MVP |
| **comms** | Kanallar, xabarlar (internal/external/direct) | `message.*` | `project.created` (kanal ochish) | MVP |
| **notification** | Qoidalar, yetkazish, in-app inbox, digest | `notification.sent` | **hamma eventlar** | MVP |
| **telegram** | Bot, akkaunt bog'lash, guruh ↔ kanal | `message.external_received` | `notification.*` | MVP |
| **activity** | Event log, audit, tarix | — | hamma eventlar | MVP |
| **dashboard** | Rahbar uchun umumiy ko'rinish, statistikalar | — | `Event` jadvalidan o'qiydi | MVP (oddiy) |
| **scheduler** | Cron: due_soon, overdue, digest | `task.due_soon`, `task.overdue` | — | MVP |
| **automation** | "Agar X bo'lsa → Y qil" qoidalari | — | eventlar | v1 |
| **files** | Fayl yuklash (S3/MinIO) | `file.uploaded` | — | v1 |
| **integrations** | GitHub (PR ↔ task), Calendar | `integration.*` | eventlar | v1+ |
| **ai** | Task yozishga yordam, loyiha xulosasi, AI-usage kuzatuvi | — | eventlar | v2 |
| **reports** | Mentor KPI, yuklama, loyiha sog'lig'i | — | Event | v2 |

## Modul shabloni (NestJS)

```
modules/task/
├── task.module.ts
├── task.controller.ts
├── task.service.ts          # biznes logika
├── task.repository.ts       # Prisma'ga murojaat faqat shu yerda
├── events/                  # task.created.event.ts ...
├── listeners/               # boshqa modul eventlariga javob
├── dto/
└── task.permissions.ts      # 'task.create', 'task.assign' ...
```
