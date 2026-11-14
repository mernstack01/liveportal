import { describe, expect, it } from 'vitest';
import { dispositionName, sniffImage } from './file-sniff.js';

describe('sniffImage', () => {
  it('haqiqiy rasm turlarini taniydi', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('GIF89a....'))).toBe('image/gif');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('SVG, HTML va soxta kengaytma rasm emas', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('dispositionName: o‘zbekcha nom va qo‘shtirnoq', () => {
    expect(dispositionName('Hisobot "oxirgi".pdf')).toBe(`filename="Hisobot _oxirgi_.pdf"; filename*=UTF-8''Hisobot%20%22oxirgi%22.pdf`);
    expect(dispositionName('to‘lov.png')).toContain("filename*=UTF-8''to%E2%80%98lov.png");
  });
});
