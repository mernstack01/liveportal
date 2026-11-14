import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** So'rov tanasini zod sxema bilan tekshiradi; xato bo'lsa 400. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ message: 'Noto‘g‘ri so‘rov', issues: z.flattenError(result.error) });
  }
  return result.data;
}
