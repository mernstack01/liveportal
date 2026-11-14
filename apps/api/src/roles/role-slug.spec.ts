import { describe, expect, it } from 'vitest';
import { roleSlug } from './role-slug.js';

describe('roleSlug', () => {
  it.each([
    ['QA muhandis', 'qa_muhandis'],
    ['Dizayner (UI/UX)', 'dizayner_ui_ux'],
    ['O‘qituvchi', 'oqituvchi'],
    ['  ', 'rol'],
    ['Тест', 'rol'],
  ])('%j → %j', (title, slug) => {
    expect(roleSlug(title)).toBe(slug);
  });
});
