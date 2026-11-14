# Jonli namoyish (lokal)

Dev bazada to'qima demo jamoa va 3 ta loyiha bor (2026-11-14 da yaratilgan). Telegram ID'lari soxta: bot ularga xabar yubora olmaydi, hech kimga haqiqiy xabar ketmaydi.

## Ishga tushirish

Avval **Docker Desktop** ochiq bo'lsin (baza shunda ishlaydi). Yopiq bo'lsa, API ochiladi, lekin kirishda 500 xatosi chiqadi.

```bash
cd ~/Desktop/WorkspaceProjects/liveportal
pnpm infra:up
pnpm dev
```

Brauzerda http://localhost:5173 → "Lokal kirish" maydoniga Telegram ID.

| Kim | Telegram ID | Rol | Nimani ko'rsatish qulay |
|---|---|---|---|
| Aziz Rahimov | `900000101` | Admin, loyihalarda teamlead | Hammasi: board, Done qilish, a'zolar, dashboard |
| Malika Yusupova | `900000102` | Mentor | Mentor Done qila olmasligi |
| Jasur Toshev | `900000103` | Mentor | "Mening tasklarim": kechikkan va bugungi tasklar |
| Nodira Aliyeva | `900000104` | Mentor | Eng band odam (dashboard'da) |

Loyihalar: **ITL** IT Live sayti, **CRM** Mentor CRM (muddati o'tgan), **TBK** Telegram bot kursi.

## Taklif qilingan ssenariy (5 daqiqa)

1. Aziz bo'lib kiring → Loyihalar → **IT Live sayti** board.
2. Biror taskni Review'dan Done'ga sudrang (teamlead huquqi).
3. **ITL-3** ni oching → izohda `@jas` yozib Jasurni belgilang.
4. **Dashboard**: kechikkan loyiha (CRM), "Kim band" jadvali.
5. Chiqing, Malika (`900000102`) bo'lib kiring → Review'dagi taskni Done'ga sudrang: kartochka qaytadi, "faqat teamlead" xabari chiqadi.
6. Jasur (`900000103`) → **Mening tasklarim**.
7. Telegram qismi uchun: `docs/media/liveportal-demo.mp4` ning oxirgi sahnasi yoki taqdimotning Telegram slaydi.

Demo ma'lumot namoyish davomida o'zgaradi (task Done bo'ladi, izoh qo'shiladi) — bu normal.

## Demo ma'lumotni o'chirish

Faqat demo foydalanuvchilar (`demo_*`) va ular a'zo bo'lgan ITL, CRM, TBK loyihalari o'chadi; boshqa ma'lumotga tegilmaydi.

```bash
cd ~/Desktop/WorkspaceProjects/liveportal && docker compose exec -T postgres psql -U liveportal -d liveportal <<'SQL'
begin;
create temp table d_u as select id from "User" where id like 'demo\_%';
create temp table d_p as select id from "Project" where key in ('ITL','CRM','TBK') and id in (select "projectId" from "ProjectMember" where "userId" in (select id from d_u));
create temp table d_t as select id from "Task" where "projectId" in (select id from d_p);
create temp table d_e as select id from "Event" where "entityId" in (select id from d_p union select id from d_t union select id from d_u);
delete from "Notification" where "eventId" in (select id from d_e) or "userId" in (select id from d_u);
delete from "Event" where id in (select id from d_e);
delete from "Comment" where "taskId" in (select id from d_t);
delete from "Task" where id in (select id from d_t);
delete from "WorkflowStatus" where "projectId" in (select id from d_p);
delete from "ProjectMember" where "projectId" in (select id from d_p);
delete from "Project" where id in (select id from d_p);
delete from "Session" where "userId" in (select id from d_u);
delete from "WorkspaceMember" where "userId" in (select id from d_u);
delete from "User" where id in (select id from d_u);
commit;
SQL
```
