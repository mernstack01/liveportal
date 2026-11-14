# 01 — Vision

## Kontekst

IT Live Academy'da mentorlar AI (Claude, Cursor, Copilot va h.k.) yordamida real loyihalar qilishadi. Loyihalar soni o'smoqda, jamoa kattalashmoqda, lekin boshqaruv jarayoni tizimlashmagan.

## Asosiy muammolar

| # | Muammo | Kimga og'riq | Hozir qanday hal qilinadi |
|---|--------|--------------|---------------------------|
| P1 | Loyihalar holati bitta joyda ko'rinmaydi | Rahbar | So'rab-surishtirib |
| P2 | Task berish va kuzatish tartibsiz | Teamlead, mentor | Telegram xabarlari, og'zaki |
| P3 | Mentorlar o'rtasidagi o'zaro tasklar yo'qolib ketadi | Mentorlar | Eslab qolish |
| P4 | Ichki va tashqi xabarlar aralash | Hamma | Turli Telegram chatlar |
| P5 | Muhim hodisalar haqida kech xabar topiladi | Hamma | — |
| P6 | Kim qancha ish qilgani (yuklama, natija) ko'rinmaydi | Rahbar | — |

## Maqsad

> Har bir loyiha, task va muhim xabar **bitta portal**da yashaydi; har kim o'ziga tegishli narsani **o'z vaqtida** (Telegram orqali) biladi; rahbar butun rasmni **bir qarashda** ko'radi.

## Muvaffaqiyat mezonlari (MVP'dan 1 oy keyin)

- [ ] Barcha faol loyihalar portalda (100%)
- [ ] Tasklarning ≥ 80% portal orqali beriladi (Telegram'da emas)
- [ ] Rahbar "loyiha qanday ketyapti?" deb so'rashga hojat qolmaydi — dashboard yetarli
- [ ] Muddati o'tgan tasklar haqida avtomatik ogohlantirish ishlaydi

## Scope

**Kiradi (dastlab):** workspace, loyihalar, tasklar, rollar, izohlar, ichki xabarlar, Telegram notification, oddiy dashboard.

**Hozircha kirmaydi:** to'lov/moliya, vaqt hisobi (time tracking), AI-agentlar avtomatizatsiyasi, mijoz portali, mobil ilova. *(Arxitektura bularni keyin qo'shishga tayyor bo'ladi — 08-ideas-backlog.md)*

## Prinsiplar

1. **Telegram — birinchi darajali kanal.** Odamlar u yerda yashaydi; portal ularni majburlamasin, balki Telegram'ni to'ldirsin.
2. **Oddiy boshlab, kengaytiriladigan qilib qurish.** MVP kichik, yadro esa moslashuvchan.
3. **Hamma narsa hodisa (event).** Task yaratildi, status o'zgardi, xabar keldi — bularning hammasi event; notification, audit, analitika, avtomatizatsiya shu eventlarga obuna bo'ladi.
4. **Konfiguratsiya > kod.** Statuslar, workflowlar, notification qoidalari — kod emas, sozlama.
