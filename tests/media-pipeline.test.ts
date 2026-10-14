import { describe, test, expect } from 'bun:test';
import { prepareSubtitle, detectSubtitleLanguage, decodeSubtitle } from '../src/core/player/subtitle-service';
import { redactDiagnostics } from '../src/core/diagnostics/redaction';
import { normalizeReleaseNotes, normalizeRolloutPercentage } from '../src/core/update/release-details';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { preloadNextEpisode, preloadFile, cancelPreload, MAX_BUDGET } = require('../desktop/runtime/torrent/session/next-episode-preloader.cjs');

describe('subtitle pipeline', () => {
  test('decodes UTF-16 and preserves ASS originals alongside playable VTT', () => {
    const text = '1\n00:00:01,000 --> 00:00:02,000\nHello\n';
    const bytes = Buffer.from('\uFEFF' + text, 'utf16le');
    expect(prepareSubtitle(decodeSubtitle(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), 'episode.eng.srt').lang).toBe('en');
    const ass = '[Script Info]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello';
    const prepared = prepareSubtitle(ass, 'episode.jpn.ass'); expect(prepared.original).toBe(ass); expect(prepared.vtt).toContain('Hello'); expect(prepared.lang).toBe('ja');
  });
  test('rejects invalid cues and leaves uncertain language und', () => {
    expect(() => prepareSubtitle('<html>server failure</html>')).toThrow();
    expect(detectSubtitleLanguage(undefined, 'episode.ass', 'Hello world')).toBe('und');
    expect(detectSubtitleLanguage('en', 'episode.jpn.srt')).toBe('en');
  });
});
describe('diagnostics and release metadata', () => {
  test('redacts nested credentials, email, signed URLs and paths', () => {
    const input = { apiKey: 'secret-key', accountId: 'private-id', message: 'Bearer abc password=supersecret email@example.com https://cdn.test/video?token=abc C:\\Users\\Person\\file.mkv', nested: [{ cookie: 'abc', authorization: 'Bearer secret' }] };
    const serialized = JSON.stringify(redactDiagnostics(input));
    for (const secret of ['secret-key', 'private-id', 'supersecret', 'email@example.com', '?token=', 'Person', 'Bearer abc']) expect(serialized).not.toContain(secret);
  });
  test('known credential values are removed even without a label in a log message', () => {
    expect(redactDiagnostics('Network failed: plain-secret-key', ['plain-secret-key'])).toBe('Network failed: [redacted]');
  });
  test('release notes normalize safely; absent and invalid staging remains unknown', () => {
    expect(normalizeReleaseNotes([{ note: 'Fix playback' }, { note: 'Improve scans' }])).toBe('Fix playback\nImprove scans');
    for (const invalid of [undefined, null, '', true, -1, 101, 'bad']) expect(normalizeRolloutPercentage(invalid)).toBeUndefined();
    expect(normalizeRolloutPercentage('25')).toBe(25);
  });
});
describe('bounded torrent preload', () => {
  test('a separate torrent starts with only a bounded piece selection', () => {
    const selections: any[] = [];
    const entry = { torrent: { pieceLength: 1024 * 1024, pieces: Array(1000), files: [{ offset: 0, length: 1000 * 1024 * 1024 }], select: (...args: any[]) => selections.push(args) } };
    expect(preloadFile(entry, 0, MAX_BUDGET).budgetBytes).toBe(MAX_BUDGET);
    expect(selections).toEqual([[0, 19, 0]]);
  });
  test('selects only budgeted next-episode pieces and restores selection on cancel', () => {
    const selected: any[] = [], deselected: any[] = [];
    const torrent = { pieceLength: 1024 * 1024, pieces: Array(500), files: [
      { name: 'Fixture - 01.mkv', offset: 0, length: 100 * 1024 * 1024 },
      { name: 'Fixture - 02.mkv', offset: 100 * 1024 * 1024, length: 100 * 1024 * 1024 }],
      select: (...args: any[]) => selected.push(args), deselect: (...args: any[]) => deselected.push(args) };
    const entry = { torrent, targetFileIndex: 0 };
    const result = preloadNextEpisode(entry, 2, 999 * 1024 * 1024);
    expect(result.budgetBytes).toBeLessThanOrEqual(MAX_BUDGET); expect(selected).toEqual([[100, 119, 0]]);
    cancelPreload(entry); expect(deselected).toEqual(selected);
    expect(preloadNextEpisode(entry, 3).success).toBe(false);
  });
});
