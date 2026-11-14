/**
 * Fayl haqiqatan rasmmi — kengaytma yoki brauzer aytganiga emas, birinchi baytlarga qaraladi.
 * Faqat shu to'rt tur brauzerda ochiladi; qolgani (SVG, HTML ham) faqat yuklab olinadi: XSS'dan himoya.
 */
export function sniffImage(head: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 6 && ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Content-Disposition uchun xavfsiz nom (RFC 5987). */
export function dispositionName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
