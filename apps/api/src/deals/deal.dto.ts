import { z } from 'zod';

export const DEAL_STAGES = ['NEW', 'DISCUSSION', 'PROPOSAL', 'CONTRACT', 'ADVANCE', 'WON', 'LOST'] as const;
/** Faol bosqichlar: keyingi qadam majburiy, eslatmalar ishlaydi. */
export const ACTIVE_STAGES = ['NEW', 'DISCUSSION', 'PROPOSAL', 'CONTRACT', 'ADVANCE'] as const;
export const DEAL_SOURCES = ['TELEGRAM', 'INSTAGRAM', 'REFERRAL', 'WEBSITE', 'CALL', 'OTHER'] as const;
export const CURRENCIES = ['UZS', 'USD'] as const;
/** Qo'lda yoziladigan tarix yozuvlari. */
export const ACTIVITY_KINDS = ['note', 'call', 'meeting'] as const;

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
/** Vaqt (ISO, zona bilan): keyingi qadam qachon. */
const when = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
/** Sana (YYYY-MM-DD): mijozga aytilgan topshirish kuni. */
const day = z.iso.date().transform((s) => new Date(`${s}T00:00:00.000Z`));
/** Summa: musbat, 2 xonagacha kasr. Satr yoki son; ichkarida satr (Decimal). */
const amount = z
  .union([z.number(), z.string().trim()])
  .transform((v) => String(v).replace(/\s/g, '').replace(',', '.'))
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Summa noto‘g‘ri');

export const createDealSchema = z.object({
  title: text(200),
  clientName: text(200),
  clientContact: z.string().trim().max(200).optional(),
  source: z.enum(DEAL_SOURCES).default('OTHER'),
  description: z.string().trim().max(10_000).optional(),
  amount: amount.optional(),
  currency: z.enum(CURRENCIES).default('UZS'),
  /** Berilmasa — yaratgan odam. Boshqa odamni faqat `deal.view_all` tayinlaydi. */
  ownerId: id.optional(),
  nextStep: text(500),
  nextStepAt: when,
  dueDate: day.optional(),
});
export type CreateDealDto = z.infer<typeof createDealSchema>;

export const updateDealSchema = z
  .object({
    title: text(200),
    clientName: text(200),
    clientContact: z.string().trim().max(200).nullable(),
    source: z.enum(DEAL_SOURCES),
    description: z.string().trim().max(10_000).nullable(),
    amount: amount.nullable(),
    currency: z.enum(CURRENCIES),
    stage: z.enum(DEAL_STAGES),
    ownerId: id,
    nextStep: text(500),
    nextStepAt: when,
    /** Avvalgi qadam natijasi: yangi qadam qo'yilganda tarixga yoziladi ("Qo'ng'iroq qildim, KP so'radi"). */
    stepResult: z.string().trim().max(2000),
    dueDate: day.nullable(),
    /** Topshirish muddati o'zgarsa — majburiy (avval sana qo'yilgan bo'lsa). */
    dueReason: z.string().trim().max(1000),
    /** "Yo'qotildi" bosqichida majburiy. */
    lostReason: z.string().trim().max(1000),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Hech narsa o‘zgartirilmadi');
export type UpdateDealDto = z.infer<typeof updateDealSchema>;

export const dealActivitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).default('note'),
  body: z.string().trim().max(4000).default(''),
});

export const listDealsQuery = z.object({
  /** Faqat `deal.view_all` uchun: bitta savdochining kelishuvlari. */
  ownerId: id.optional(),
  q: z.string().trim().max(100).optional(),
});
