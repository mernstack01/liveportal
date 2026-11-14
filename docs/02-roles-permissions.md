# 02 — Rollar va ruxsatlar

## Rollar (taklif)

| Rol | Daraja | Kim | Asosiy vazifa |
|-----|--------|-----|---------------|
| **Owner / Rahbar** | Workspace | Akademiya rahbari | Hamma narsani ko'radi, rollar beradi, umumiy nazorat |
| **Admin** | Workspace | Operator / menejer | Foydalanuvchilar, sozlamalar, integratsiyalar |
| **Teamlead** | Project | Loyiha yetakchisi | Loyihani boshqaradi, task beradi, review qiladi |
| **Mentor / Member** | Project | Mentor-dasturchi | Task bajaradi, boshqalarga task beradi (o'zaro) |
| **Guest / External** | Project | Mijoz, hamkor | Faqat ruxsat berilgan loyiha va tashqi kanalni ko'radi |

> Bitta odam bir loyihada Teamlead, boshqasida Member bo'lishi mumkin → rol **loyiha darajasida** beriladi (`ProjectMember.role`).

## Ruxsatlar matritsasi (MVP)

| Amal | Owner | Admin | Teamlead | Member | Guest |
|------|:-----:|:-----:|:--------:|:------:|:-----:|
| Workspace sozlamalari | ✅ | ✅ | — | — | — |
| Foydalanuvchi qo'shish / rol berish | ✅ | ✅ | loyihaga | — | — |
| Loyiha yaratish | ✅ | ✅ | ✅ | ❓ | — |
| Loyihani arxivlash / o'chirish | ✅ | ✅ | ✅ (o'zinikini) | — | — |
| Task yaratish | ✅ | ✅ | ✅ | ✅ | ❓ |
| Taskni boshqaga tayinlash | ✅ | ✅ | ✅ | ✅ (o'zaro) | — |
| Task statusini "Done"ga o'tkazish | ✅ | ✅ | ✅ | review orqali ❓ | — |
| Ichki xabarlarni ko'rish | ✅ | ✅ | ✅ | ✅ | — |
| Tashqi kanalni ko'rish/yozish | ✅ | ✅ | ✅ | ❓ | ✅ |
| Barcha loyihalar dashboardi | ✅ | ✅ | — | — | — |

❓ — `07-open-questions.md` da hal qilinadi.

## Texnik yondashuv

- **RBAC + permission string'lar**: `project.create`, `task.assign`, `message.external.read` …
- Rol = permission'lar to'plami, **bazada saqlanadi** (kodda hardcode emas) → keyin yangi rol qo'shish (masalan, "QA", "Student") kod o'zgartirmasdan.
- NestJS'da `@RequirePermission('task.assign')` guard + resource scope (workspace / project).
