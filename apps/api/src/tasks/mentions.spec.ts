import { describe, expect, it } from 'vitest';
import { extractMentions } from './mentions.js';

describe('extractMentions', () => {
  it('username’larni topadi, kichik harfga o‘tkazadi va takrorlarni olib tashlaydi', () => {
    expect(extractMentions('@Ali_mentor qarab chiqing, @vali_dev ham. @ali_MENTOR!')).toEqual(['ali_mentor', 'vali_dev']);
  });

  it('qator boshida va qavs ichida ham ishlaydi', () => {
    expect(extractMentions('(@teamlead1) va\n@mentor_22')).toEqual(['teamlead1', 'mentor_22']);
  });

  it('email, qisqa nom va @@ mention emas', () => {
    expect(extractMentions('ali@itlive.uz @abc @@double_at salom')).toEqual([]);
  });
});
