import { describe, expect, it } from 'bun:test';
import { requireKaiArchive } from '../src/core/extensions/kai-payload';

describe('native extension download responses', () => {
  it('accepts package bytes without changing them', () => {
    const data = new Uint8Array([0x50, 0x4b, 3, 4, 10, 0]).buffer;
    expect(requireKaiArchive(data)).toBe(data);
  });
  for (const body of ['<!doctype html><html>Portal</html>', '{"id":"extension","version":"1"}', '']) {
    it('rejects non-package responses before invoking the ZIP installer', () => {
      expect(() => requireKaiArchive(new TextEncoder().encode(body).buffer)).toThrow('instead of a .kai archive');
    });
  }
});
