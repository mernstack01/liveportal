# LivePortal — AI agentlar uchun qoidalar

IT Live Academy ichki portali: loyihalar, tasklar, Telegram bildirishnomalari. Til: o'zbek (lotin) — hujjatlar, izohlar, UI matnlari. Kod identifikatorlari inglizcha.

## Avval o'qing
- `docs/09-fast-track.md` — joriy reja (MVP-0, kunma-kun). Undan tashqari funksiya qo'shilmaydi; yangi g'oya `docs/08-ideas-backlog.md` ga.
- `docs/03-domain-model.md`, `docs/04-architecture.md`, `docs/05-modules.md`.
- `docs/07-open-questions.md` — javoblar hali taklif, tasdiqlanmagan bo'lishi mumkin.

## Tuzilma
- `apps/api` — NestJS 12, ESM (`.js` bilan import), Prisma 7 + `@prisma/adapter-pg`. Client `src/generated/prisma` ga generatsiya qilinadi (git'da yo'q).
- `apps/web` — Vite + React 19 + Tailwind 4 + TanStack Query + react-router 8 + @dnd-kit. API chaqiruvlari faqat `src/api.ts` orqali, query kalitlari `src/queries.ts` da, o'zbekcha yorliqlar `src/labels.ts` da. UI ruxsatga qarab ko'rinadi (`useMe().can`, `project.myPermissions`), lekin haqiqiy tekshiruv API'da.
- `packages/shared` — rollar, ruxsatlar, workflow, event nomlari. O'zgartirgandan keyin `pnpm --filter @liveportal/shared build`.

## Qoidalar
1. Modul faqat o'z jadvallariga yozadi; boshqa modulga ta'sir — event yoki public service orqali.
2. Biznes amal va `Event` qatori bitta Prisma tranzaksiyasida yoziladi (outbox). Eventga reaksiya — `EventBus.subscribe(type, nom, (event, tx) => ...)`; obunachi yozuvlari `tx` orqali (dispatcher tranzaksiyasi).
3. Ruxsat nomlari `packages/shared/src/permissions.ts` da; rol → ruxsat xaritasi bazada. Kodda rol nomini tekshirmang, ruxsatni tekshiring.
4. Modul shabloni: `docs/05-modules.md` (controller → service → repository, `events/`, `listeners/`, `dto/`).
5. Har yangi endpoint uchun kamida bitta e2e test (`apps/api/test`).
6. Sxema o'zgarsa: `pnpm db:migrate --name <nom>` (interaktiv). Agent (interaktivsiz): `mkdir prisma/migrations/<UTC vaqt>_<nom>` → `pnpm db:diff > .../migration.sql` → `pnpm db:deploy` → `prisma generate`. Migration fayllarini qo'lda tahrirlamang.
7. Sir (bot token, parol) faqat `.env` da, hech qachon kodda yoki hujjatda.

## Tekshirish
- Testlar kodni yangidan kompilyatsiya qiladi, dev server esa yo'q. API'ni o'zgartirgandan keyin dev logida **o'zgarishdan keyingi** `Nest application successfully started` qatorini toping; yo'q bo'lsa (`Found N errors` bilan qotib qolgan), `pnpm dev` ni qayta ishga tushiring.
- `pnpm build` ni `pnpm dev` ishlab turganda ishga tushirmang (`dist` o'chadi, dev API to'xtaydi). API uchun `tsc --noEmit` yetarli.
- Brauzerda tekshirish uchun haqiqiy akkauntlarga tegmang: vaqtinchalik foydalanuvchi yarating (telegramId 9000000xx) va oxirida uning ma'lumotlarini o'chiring.

## Buyruqlar
`pnpm infra:up` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm dev` · `pnpm test` · `pnpm --filter @liveportal/api test:e2e` · `pnpm lint` · `pnpm build`
