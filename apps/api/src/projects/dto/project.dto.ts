import { z } from 'zod';

/** `YYYY-MM-DD` → UTC yarim tun. Muddatlar kun aniqligida. */
const dateOnly = z.iso.date().transform((s) => new Date(`${s}T00:00:00.000Z`));

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;

export const createProjectSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Kalit 2–10 belgi: lotin harfi bilan boshlanadi, faqat harf va raqam'),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(5000).optional(),
    startDate: dateOnly.optional(),
    dueDate: dateOnly.optional(),
  })
  .refine((d) => !d.startDate || !d.dueDate || d.dueDate >= d.startDate, {
    message: 'Muddat boshlanish sanasidan oldin bo‘lishi mumkin emas',
    path: ['dueDate'],
  });
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

/** Kalit o'zgarmaydi: task raqamlari (LP-12) unga bog'liq. */
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(5000).nullable(),
    startDate: dateOnly.nullable(),
    dueDate: dateOnly.nullable(),
    status: z.enum(PROJECT_STATUSES),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Hech narsa o‘zgartirilmadi' });
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

export const listProjectsQuery = z.object({
  archived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1).max(64),
  role: z.string().min(1).max(64).default('developer'),
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export const changeMemberRoleSchema = z.object({
  role: z.string().min(1).max(64),
});
