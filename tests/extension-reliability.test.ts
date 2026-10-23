import { describe, expect, test } from 'bun:test';
import { extensionDeadline } from '../src/core/extensions/remote/deadline';
import { isDebridDirectUrl } from '../src/core/player/debrid-url';
import { normalizeStremioStream } from '../src/core/extensions/remote/stremio';
import { isExplicitExtensionContent } from '../src/lib/contentSafety';

describe('extension request deadlines', () => {
  test('bounds an unresponsive native bridge and aborts its work signal', async () => {
    let signal: AbortSignal | undefined;
    await expect(extensionDeadline(current => { signal = current; return new Promise(() => {}); }, 20)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(signal?.aborted).toBe(true);
  });
  test('respects cancellation before starting work', async () => {
    const controller = new AbortController(); controller.abort(); let called = false;
    await expect(extensionDeadline(async () => { called = true; }, 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(called).toBe(false);
  });
  test('settles successful work with a supplied parent signal', async () => {
    expect(await extensionDeadline(async () => 42, 50, new AbortController().signal)).toBe(42);
  });
});

test('TorBox signed links retain debrid identity for native multi-track playback', () => {
  const url = 'https://cdn.torbox.app/download/file?token=fixture';
  expect(normalizeStremioStream({ url }, 'addon', 'Addon').sourceType).toBe('debrid');
  expect(isDebridDirectUrl('https://torbox.app.attacker.test/file')).toBe(false);
  expect(isDebridDirectUrl('https://example.test/file?url=https://torbox.app')).toBe(false);
  expect(normalizeStremioStream({ url: 'https://example.test/video.m3u8' }, 'addon', 'Addon').sourceType).toBe('hls');
});

test('mature extension metadata is recognized without hiding ordinary content', () => {
  expect(isExplicitExtensionContent({ nsfw: true, name: 'Generic source' })).toBe(true);
  expect(isExplicitExtensionContent({ name: 'HentaiDB' })).toBe(true);
  expect(isExplicitExtensionContent({ title: 'An ordinary title', genres: ['Hentai'] })).toBe(true);
  expect(isExplicitExtensionContent({ title: 'An ordinary title', genres: ['Adventure'] })).toBe(false);
});
