import { z } from 'zod';

export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
export const INCIDENT_STATUSES = ['OPEN', 'INVESTIGATING', 'MONITORING', 'RESOLVED'] as const;
const id = z.string().min(1).max(64);
/** Boshlangan vaqt kelajakda bo'lmaydi (bir daqiqa farqqa ruxsat — soatlar biroz farq qilishi mumkin). */
const startedAt = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now() + 60_000, 'Boshlanish vaqti kelajakda bo‘lmaydi');

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  severity: z.enum(SEVERITIES).default('SEV3'),
  ownerId: id.optional(),
  /** Muammo qachon boshlangan; berilmasa — hozir. */
  startedAt: startedAt.optional(),
});
export type CreateIncidentDto = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).nullable(),
    severity: z.enum(SEVERITIES),
    status: z.enum(INCIDENT_STATUSES),
    ownerId: id.nullable(),
    /** Sabab va yechim: odatda hal qilinganda yoziladi. */
    resolution: z.string().trim().max(10_000).nullable(),
    startedAt,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Hech narsa o‘zgartirilmadi');
export type UpdateIncidentDto = z.infer<typeof updateIncidentSchema>;

/** Matn bo'sh bo'lishi mumkin, agar fayl biriktirilgan bo'lsa (tekshiruv service'da). */
export const incidentNoteSchema = z.object({
  body: z.string().trim().max(4000).default(''),
});

export const listIncidentsQuery = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('all'),
});
