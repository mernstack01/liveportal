/** Tizim rollari nomlari: yaratilgan rol ular bilan to'qnashmasligi kerak. */
export const RESERVED_ROLE_NAMES = new Set(['owner', 'admin', 'member', 'teamlead', 'developer', 'guest', 'mentor', 'client']);

/** "QA muhandis" → "qa_muhandis". O'zbekcha belgilar (o‘, g‘, ’) tashlab yuboriladi. */
export function roleSlug(title: string): string {
  const base = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'rol';
}
