import { z } from 'zod';
import { TIME_RE } from '../due.js';

const dateOnly = z.iso.date().transform((s) => new Date(`${s}T00:00:00.000Z`));
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TASK_TYPES = ['TASK', 'BUG', 'FEATURE'] as const;
const id = z.string().min(1).max(64);
/** Muddat soati "HH:MM" (Toshkent). Faqat sana bilan birga. */
const time = z.string().regex(TIME_RE, 'Soat HH:MM ko‘rinishida bo‘lsin');

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    type: z.enum(TASK_TYPES).optional(),
    /** Kichik vazifa (subtask) bo'lsa — ota task id'si. */
    parentId: id.optional(),
    dueDate: dateOnly.optional(),
    dueTime: time.optional(),
    /** Mas'ullar: bir nechta odam birga javobgar bo'lishi mumkin. */
    assigneeIds: z.array(id).max(10).optional(),
    /** Berilmasa, loyihaning birinchi statusi (Backlog). */
    statusId: id.optional(),
    /** Insidentdan yaratilayotgan task (tuzatish, keyingi qadam). */
    incidentId: id.optional(),
  })
  .refine((d) => !d.dueTime || d.dueDate, { message: 'Soat faqat sana bilan birga beriladi', path: ['dueTime'] });
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).nullable(),
    priority: z.enum(PRIORITIES),
    type: z.enum(TASK_TYPES),
    dueDate: dateOnly.nullable(),
    dueTime: time.nullable(),
    /** Mas'ullar ro'yxati to'liq almashtiriladi ([] — hech kim). */
    assigneeIds: z.array(id).max(10),
    statusId: id,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Hech narsa o‘zgartirilmadi' });
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const listTasksQuery = z.object({
  /** `me` yoki userId. */
  assignee: z.string().min(1).max(64).optional(),
  statusId: id.optional(),
  /** true — kichik vazifalar ham (odatda faqat asosiy tasklar). */
  subtasks: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const myTasksQuery = z.object({
  /** true bo'lsa yopilgan (Done) tasklar ham. */
  all: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
