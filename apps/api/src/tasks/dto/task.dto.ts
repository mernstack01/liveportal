import { z } from 'zod';

const dateOnly = z.iso.date().transform((s) => new Date(`${s}T00:00:00.000Z`));
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const id = z.string().min(1).max(64);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: dateOnly.optional(),
  assigneeId: id.optional(),
  /** Berilmasa, loyihaning birinchi statusi (Backlog). */
  statusId: id.optional(),
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).nullable(),
    priority: z.enum(PRIORITIES),
    dueDate: dateOnly.nullable(),
    assigneeId: id.nullable(),
    statusId: id,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Hech narsa o‘zgartirilmadi' });
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const listTasksQuery = z.object({
  /** `me` yoki userId. */
  assignee: z.string().min(1).max(64).optional(),
  statusId: id.optional(),
});

export const myTasksQuery = z.object({
  /** true bo'lsa yopilgan (Done) tasklar ham. */
  all: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
