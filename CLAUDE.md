# LivePortal — AI agentlar uchun qoidalar

IT Live Academy ichki portali: loyihalar, tasklar, Telegram bildirishnomalari. Til: o'zbek (lotin) — hujjatlar, izohlar, UI matnlari. Kod identifikatorlari inglizcha.

## Avval o'qing
- `docs/09-fast-track.md` — joriy reja (MVP-0, kunma-kun). Undan tashqari funksiya qo'shilmaydi; yangi g'oya `docs/08-ideas-backlog.md` ga.
- `docs/03-domain-model.md`, `docs/04-architecture.md`, `docs/05-modules.md`.
- `docs/07-open-questions.md` — javoblar hali taklif, tasdiqlanmagan bo'lishi mumkin.

## Tuzilma
- `apps/api` — NestJS 12, ESM (`.js` bilan import), Prisma 7 + `@prisma/adapter-pg`. Client `src/generated/prisma` ga generatsiya qilinadi (git'da yo'q).
- `apps/web` — Vite + React 19 + Tailwind 4 + TanStack Query. API chaqiruvlari faqat `src/api.ts` orqali.
- `packages/shared` — rollar, ruxsatlar, workflow, event nomlari. O'zgartirgandan keyin `pnpm --filter @liveportal/shared build`.

## Qoidalar
1. Modul faqat o'z jadvallariga yozadi; boshqa modulga ta'sir — event yoki public service orqali.
2. Biznes amal va `Event` qatori bitta Prisma tranzaksiyasida yoziladi (outbox).
3. Ruxsat nomlari `packages/shared/src/permissions.ts` da; rol → ruxsat xaritasi bazada. Kodda rol nomini tekshirmang, ruxsatni tekshiring.
4. Modul shabloni: `docs/05-modules.md` (controller → service → repository, `events/`, `listeners/`, `dto/`).
5. Har yangi endpoint uchun kamida bitta e2e test (`apps/api/test`).
6. Sxema o'zgarsa: `pnpm db:migrate --name <nom>`; migration fayllarini qo'lda tahrirlamang.
7. Sir (bot token, parol) faqat `.env` da, hech qachon kodda yoki hujjatda.

## Buyruqlar
`pnpm infra:up` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm dev` · `pnpm test` · `pnpm --filter @liveportal/api test:e2e` · `pnpm lint` · `pnpm build`
