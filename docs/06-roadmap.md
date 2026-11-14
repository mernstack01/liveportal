# 06 — Roadmap

## Faza 0 — Tizimlashtirish (hozir)
- [ ] `07-open-questions.md` ga javoblar
- [ ] Rahbar va 2–3 mentor bilan 15 daqiqalik suhbat: eng katta og'riq qaysi?
- [ ] MVP scope'ni qotirish
- [ ] Asosiy ekranlar wireframe'i (dashboard, loyiha, task board, task detail, inbox)

## Faza 1 — MVP (≈ 4–6 hafta)
**Maqsad:** tasklar Telegram'dan portalga ko'chsin.

- [ ] Monorepo skeleton, docker-compose (postgres, redis), CI
- [ ] Auth: Telegram Login + bot orqali akkaunt bog'lash
- [ ] Workspace, a'zolar, rollar
- [ ] Loyihalar + standart workflow
- [ ] Tasklar: yaratish, tayinlash, status, muddat, prioritet, izoh, @mention
- [ ] Kanban board + "Mening tasklarim" ro'yxati
- [ ] Event bus + outbox + activity log
- [ ] Telegram notification: task tayinlandi, status o'zgardi, mention, overdue
- [ ] Bot: `/mytasks`, inline tugmalar bilan status o'zgartirish
- [ ] Rahbar dashboardi: loyihalar ro'yxati, progress, overdue tasklar

## Faza 2 — v1
- [ ] Ichki kanallar (loyiha chati) + Telegram guruh/topic bilan sinxron
- [ ] Tashqi kanal (mijoz/hamkor) — alohida ruxsat bilan
- [ ] Kunlik digest
- [ ] Custom fields, sozlanadigan workflow
- [ ] Notification qoidalari UI orqali
- [ ] Fayllar

## Faza 3 — v2+
- [ ] Automation qoidalari
- [ ] GitHub integratsiyasi
- [ ] AI-yordamchi (task generatsiya, loyiha xulosasi)
- [ ] Mentor KPI va hisobotlar
- [ ] Mobil ilova (Expo)
- [ ] Multi-workspace (boshqa akademiyalarga SaaS sifatida?)
