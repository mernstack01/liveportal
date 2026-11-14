# 03 — Domain model

## Iyerarxiya

```
Workspace (IT Live)
 ├── Members (User + workspace role)
 ├── Teams (ixtiyoriy guruhlar: Backend, Mobile, AI ...)
 ├── Projects
 │    ├── ProjectMembers (User + project role)
 │    ├── Workflow (statuslar to'plami — sozlanadi)
 │    ├── Tasks
 │    │    ├── Subtasks (parentId orqali)
 │    │    ├── Comments
 │    │    ├── Attachments
 │    │    ├── Dependencies (blocks / blocked by)
 │    │    └── Activity (event log)
 │    └── Channels (internal / external)
 │         └── Messages
 ├── NotificationRules
 └── Integrations (Telegram, GitHub, ...)
```

## Asosiy obyektlar

| Obyekt | Vazifasi | Muhim maydonlar |
|--------|----------|-----------------|
| **User** | Tizimdagi odam | name, email?, phone?, `telegramId`, avatar |
| **Workspace** | Tashkilot (multi-tenant uchun tayyor) | name, slug, settings |
| **WorkspaceMember** | User ↔ Workspace | role (owner/admin/member) |
| **Project** | Loyiha | name, key (`LP`), description, status, startDate, dueDate, teamleadId, `customFields` |
| **ProjectMember** | User ↔ Project | role (teamlead/member/guest) |
| **WorkflowStatus** | Loyiha statuslari | name, category (`todo`/`in_progress`/`review`/`done`), order, color |
| **Task** | Ish birligi | key (`LP-42`), title, description, statusId, priority, assigneeId, reporterId, dueDate, parentId, estimate, `customFields` |
| **TaskDependency** | Tasklar bog'liqligi | fromTaskId, toTaskId, type |
| **Comment** | Task ichidagi muhokama | body, authorId, mentions |
| **Channel** | Xabarlar oqimi | type (`internal`/`external`/`direct`), projectId?, `telegramChatId?` |
| **Message** | Xabar | body, authorId, source (`portal`/`telegram`), replyToId |
| **Event** | Har bir o'zgarish yozuvi | type, actorId, entityType, entityId, payload (JSON) |
| **Notification** | Foydalanuvchiga yetkazilgan xabarnoma | userId, eventId, channel (`in_app`/`telegram`), status, readAt |
| **NotificationRule** | Kimga, qachon, qayerga | eventType, conditions (JSON), recipients, channels |

## Moslashuvchanlik nuqtalari

1. **`customFields` (JSONB)** — Project va Task'da. Har bir loyiha o'ziga kerakli maydonlarni qo'sha oladi (masalan, "AI tool", "Mijoz", "Repo URL") — migration'siz.
2. **Workflow loyiha bo'yicha sozlanadi** — bitta loyiha `Todo → Doing → Done`, boshqasi `Backlog → Dev → Review → QA → Done`.
3. **Status `category`** — statuslar nomi har xil bo'lsa ham, dashboard va hisobotlar `category` bo'yicha ishlaydi.
4. **`Event` jadvali** — hamma narsaning tarixi; yangi modul (analitika, AI-yordamchi, KPI) shu yerdan o'qiydi.
5. **`Channel.type`** — internal/external ajratish bitta model bilan; keyin `client_portal`, `announcement` turlari qo'shiladi.

## Asosiy eventlar (MVP)

```
project.created         project.member_added     project.status_changed
task.created            task.assigned            task.status_changed
task.due_soon           task.overdue             task.commented
task.mentioned          message.posted           message.external_received
```
