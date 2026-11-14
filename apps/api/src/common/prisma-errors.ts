import { Prisma } from '../generated/prisma/client.js';

/** Unique cheklovi buzildi (masalan, loyiha kaliti band). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
