/**
 * Matndagi `@username` larni topadi (Telegram username qoidasi: 5–32 belgi, harf/raqam/_).
 * Email (`a@b.uz`) va `@@` mention hisoblanmaydi. Natija kichik harflarda, takrorsiz.
 */
export function extractMentions(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/(?:^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{5,32})(?![A-Za-z0-9_])/g)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}
