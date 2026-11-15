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
| Malika Yusupova | `900000102` | Dasturchi | Dasturchi Done qila olmasligi |
| Jasur Toshev | `900000103` | Dasturchi | "Mening tasklarim": kechikkan va bugungi tasklar |
| Nodira Aliyeva | `900000104` | Dasturchi | Eng band odam (dashboard'da) |
| Bobur Karimov | `900000105` | Mijoz (**MOB** loyihasida) | Faqat "Mijoz bilan" chat: board va tasklar ko'rinmaydi |

Loyihalar: **ITL** IT Live sayti, **CRM** Mentor CRM (muddati o'tgan), **TBK** Telegram bot kursi, **MOB** Mobil ilova (mijoz demo: Aziz teamlead, Jasur dasturchi, Bobur mijoz).

## Taklif qilingan ssenariy (5 daqiqa)

1. Aziz bo'lib kiring → Loyihalar → **IT Live sayti** board.
2. Biror taskni Review'dan Done'ga sudrang (teamlead huquqi).
3. **ITL-3** ni oching → izohda `@jas` yozib Jasurni belgilang.
4. **Dashboard**: kechikkan loyiha (CRM), "Kim band" jadvali.
5. Chiqing, Malika (`900000102`) bo'lib kiring → Review'dagi taskni Done'ga sudrang: kartochka qaytadi, "faqat teamlead" xabari chiqadi.
6. Jasur (`900000103`) → **Mening tasklarim**.
7. Bobur (`900000105`) → **Mobil ilova** → to'g'ridan-to'g'ri "Mijoz bilan" chat ochiladi, menyuda faqat "Loyihalar". Xabar yozing → Aziz bo'lib kiring, **Mijoz bilan** bo'limida javob bering. Jasur'da bu bo'lim yo'q.
8. Jasur → **Mobil ilova** → **Insidentlar** → "🚨 Insident ochish" (SEV1). Aziz → **Dashboard** tepasida qizil karta → insidentni oching → "🙋 Men olaman", yangilanish yozing, "Kuzatuvda", "Hal qilindi" (sabab va yechim bilan). Xronologiya o'zi yoziladi. Shu panelda **"+ Task yaratish"**: tuzatish ishini Jasur'ga bering — prioritet darajadan to'ladi, task board'da "🚨 INC-1" belgisi bilan chiqadi.
9. Telegram qismi uchun: `docs/media/liveportal-demo.mp4` ning oxirgi sahnasi yoki taqdimotning Telegram slaydi.

Demo ma'lumot namoyish davomida o'zgaradi (task Done bo'ladi, izoh qo'shiladi) — bu normal.

## Demo ma'lumotni o'chirish

Faqat demo foydalanuvchilar (`demo_*`) va ular a'zo bo'lgan ITL, CRM, TBK, MOB loyihalari o'chadi; boshqa ma'lumotga tegilmaydi.

```bash
cd ~/Desktop/WorkspaceProjects/liveportal && docker compose exec -T postgres psql -U liveportal -d liveportal <<'SQL'
begin;
create temp table d_u as select id from "User" where id like 'demo\_%';
create temp table d_p as select id from "Project" where key in ('ITL','CRM','TBK','MOB') and id in (select "projectId" from "ProjectMember" where "userId" in (select id from d_u));
create temp table d_t as select id from "Task" where "projectId" in (select id from d_p);
create temp table d_e as select id from "Event" where "entityId" in (select id from d_p union select id from d_t union select id from d_u union select id from "Incident" where "projectId" in (select id from d_p) union select m.id from "Message" m join "Channel" c on c.id = m."channelId" where c."projectId" in (select id from d_p));
delete from "Notification" where "eventId" in (select id from d_e) or "userId" in (select id from d_u);
delete from "Event" where id in (select id from d_e);
delete from "Comment" where "taskId" in (select id from d_t);
delete from "Incident" where "projectId" in (select id from d_p);
delete from "Message" where "channelId" in (select id from "Channel" where "projectId" in (select id from d_p));
delete from "Channel" where "projectId" in (select id from d_p);
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
