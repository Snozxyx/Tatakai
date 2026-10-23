import { expect, test } from 'bun:test';
import { isServerMediaUrl } from '../src/core/player/server-media-url';

test('recognizes media tickets from community servers without a hardcoded host', () => {
  const ticket = `${'a'.repeat(16)}.${'b'.repeat(40)}_123-xyz`;
  expect(isServerMediaUrl(`https://community.example/api/server/v1/media/${ticket}`)).toBe(true);
  expect(isServerMediaUrl(`http://localhost:8787/api/server/v1/media/${ticket}`)).toBe(true);
  for (const value of [
    'https://community.example/api/server/v1/resolve',
    'https://community.example/api/server/v1/media/',
    'https://community.example/api/server/v1/media/abc?url=https://other.example',
    'https://user:pass@community.example/api/server/v1/media/abc',
    'https://community.example/api/server/v1/media/abc/extra',
    'file:///api/server/v1/media/abc',
  ]) expect(isServerMediaUrl(value)).toBe(false);
});
