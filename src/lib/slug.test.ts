import { generateShortSlug } from './slug';

test('generateShortSlug produces correct length and characters', () => {
  const s = generateShortSlug(10);
  expect(s).toHaveLength(10);
  expect(/^[a-z0-9]+$/.test(s)).toBe(true);
});
