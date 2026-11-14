# 07 — Ochiq savollar

> Kod yozishdan oldin javob kerak. Har savol ostida **taklif javob** bor: bu taxmin, fakt emas.
> Rozi bo'lsangiz `✅`, rozi bo'lmasangiz o'z javobingizni yozing. `✍️` belgili savollarga faqat siz javob bera olasiz.

## Biznes / jarayon
1. **Kim foydalanadi?** Nechta mentor, nechta teamlead, nechta faol loyiha bor hozir?
   > ✍️ Raqamlarni siz yozasiz. Bu yuklamani emas, pilot hajmini belgilaydi.

2. **"Loyiha" nima?** Ichki o'quv loyihasimi, mijoz uchun real loyihami yoki ikkalasi? Ular boshqacha boshqariladimi?
   > **Taklif:** ikkalasi ham. MVP'da bir xil boshqariladi, farq `customFields.type = internal | client` bilan belgilanadi. Mijoz loyihasi uchun alohida ruxsatlar v1 da (Guest roli).

3. **Studentlar** ham tizimga kiradimi yoki faqat mentorlar?
   > **Taklif:** MVP'da yo'q, faqat mentorlar, teamleadlar va rahbar. Keyin `Student` roli bazaga qator sifatida qo'shiladi, kod o'zgarmaydi.

4. **Task oqimi:** task kim tomonidan yopiladi — bajaruvchi o'zimi yoki teamlead review qilgandan keyinmi?
   > **Taklif:** bajaruvchi taskni `Review` ga o'tkazadi, `Done` ga faqat teamlead (yoki task bergan odam) o'tkazadi. Bu `task.close` ruxsati bilan boshqariladi, keyin loyiha bo'yicha o'zgartirish mumkin.
   > Standart statuslar: `Backlog → To do → In progress → Review → Done`.
   > **Kodda (4-kun):** shunday qilindi. Done (yoki Canceled) ga o'tkazish va undan qaytarish `task.close` talab qiladi; mentorda bu ruxsat yo'q. Boshqacha kerak bo'lsa, faqat rol ruxsatlari o'zgaradi.

5. **O'zaro tasklar:** mentor boshqa loyihadagi mentorga task bera oladimi?
   > **Taklif:** ha, workspace ichidagi istalgan odamga. Agar u loyiha a'zosi bo'lmasa, avtomatik `Member` sifatida qo'shiladi va teamleadga xabar boradi.
   > **Kodda (4-kun), vaqtincha qattiqroq:** task faqat loyiha a'zosiga beriladi, aks holda 400 "Avval uni loyihaga qo'shing". Avtomatik qo'shish tasdiqlangandan keyin qo'shiladi.

6. **"AI bilan loyiha"** — AI ishlatilishini (qaysi tool, qancha token/xarajat, qaysi task AI bilan qilingan) kuzatish kerakmi?
   > **Taklif:** MVP'da yo'q. Taskda ixtiyoriy `customFields.aiTool` maydoni. Token va xarajat kuzatuvi v2 (`ai` moduli).

7. **Rahbar nimani ko'rishni xohlaydi?**
   > **Taklif (rahbardan tasdiqlash kerak):** 3 ta savol:
   > 1. Qaysi loyiha kechikyapti? (muddati o'tgan tasklar, progress foizi)
   > 2. Kim band, kim bo'sh? (mentor bo'yicha ochiq tasklar soni)
   > 3. Bu hafta nima yopildi? (`Done` ga o'tgan tasklar)
   > **Kodda (9-kun):** `/dashboard` shu uch savolga javob beradi, qo'shimcha: Review kutayotgan va egasiz tasklar soni. Rahbar bilan pilotda tekshiriladi.

## Kommunikatsiya
8. **Ichki xabarlar** — portalda alohida chat kerakmi yoki mavjud Telegram guruhlar bilan sinxronlash yetarlimi?
   > **Taklif:** MVP'da chat yo'q, Telegram guruhlar qoladi. Muhokama task izohlarida bo'ladi. v1 da loyiha kanali ↔ Telegram guruh/topic sinxroni.

9. **Tashqi xabarlar** — kim bilan? (mijozlar, hamkorlar, ota-onalar?) Ular portalga kiradimi yoki faqat Telegram orqali?
   > ✍️ Kim bilan ekanini siz yozasiz.
   > **Taklif:** ular portalga kirmaydi, faqat Telegram orqali yozadi. v1 da ularning xabari portaldagi `external` kanalga tushadi va javob bot orqali qaytadi.

10. **Notification shovqini** — qaysi hodisalar albatta xabar bo'lishi kerak, qaysilari faqat digest'da?
    > **Taklif:** darhol: `task.assigned` (menga), `task.mentioned`, `task.commented` (mening taskimga), `task.status_changed → Review` (teamleadga), `task.overdue`.
    > Ertalabki digest (09:00): bugun muddati tugaydigan va kechikkan tasklar. Qolgan hammasi faqat portalda.

## Texnik
11. Hosting qayerda? (VPS, Vercel + Railway, akademiya serveri?)
    > **Taklif:** bitta VPS (2 vCPU / 4 GB) + docker compose + Caddy (avtomatik HTTPS). Akademiyaning serveri bo'lsa, o'sha.
    > **Kodda:** `deploy/` tayyor (shu taklif bo'yicha). ✍️ Qaysi server va domen — siz aytasiz.

12. Mavjud tizimlar bilan integratsiya kerakmi? (CRM, LMS, Google Sheets, GitHub org)
    > **Taklif:** MVP'da yo'q. Birinchi integratsiya GitHub (PR ↔ task), v1+.

13. Til: interfeys faqat o'zbekchami yoki uz/ru/en?
    > **Taklif:** faqat o'zbek (lotin). Matnlar bitta faylda (`packages/shared/i18n/uz.ts`), shunda keyin rus tili qo'shish oson.

14. Kelajakda boshqa akademiyalarga sotish rejasi bormi?
    > **Taklif:** hozir rejalashtirmaymiz. `Workspace` modeli allaqachon bor, shuning uchun keyin multi-tenant qilish mumkin. RLS va billing hozir qilinmaydi.
