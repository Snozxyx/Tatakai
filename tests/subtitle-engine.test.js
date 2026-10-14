import { describe, expect, it } from 'bun:test';
import { normalizeSubtitleToVtt, isBrowserReadyVttUrl } from '../src/core/player/subtitle-utils.ts';
import { buildDubSubtitles } from '../src/lib/watch/sourceIntelligence.ts';
import { decodeSubtitle, prepareSubtitle } from '../src/core/player/subtitle-service.ts';

describe('subtitle engine utilities', () => {
  it('decodes downloaded UTF-16 subtitles before VTT conversion', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello';
    const bytes = new Uint8Array(2 + srt.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < srt.length; i++) {
      bytes[2 + i * 2] = srt.charCodeAt(i) & 255;
      bytes[3 + i * 2] = srt.charCodeAt(i) >> 8;
    }
    expect(prepareSubtitle(decodeSubtitle(bytes.buffer)).vtt).toContain('Hello');
  });
  it('normalizes raw offline SRT, ASS and extensionless subtitles before creating browser tracks', () => {
    for (const name of ['english.srt', 'english.ass', 'subtitle.bin']) {
      expect(isBrowserReadyVttUrl(`http://127.0.0.1:43127/offline/abc/${name}`)).toBe(false);
    }
    expect(isBrowserReadyVttUrl('http://127.0.0.1:43127/offline/abc/english.vtt')).toBe(true);
  });
  it('keeps distinct simultaneous cue positions and text while deduplicating exact repeats', () => {
    const vtt = normalizeSubtitleToVtt(`WEBVTT

00:00:01.000 --> 00:00:04.000 line:10%
Hello

00:00:01.000 --> 00:00:04.000 line:90%
Hello

00:00:01.000 --> 00:00:04.000 line:90%
Hello

00:00:01.000 --> 00:00:04.000 line:10%
HELLO`);
    expect((vtt.match(/--> /g) || []).length).toBe(3);
    expect(vtt).toContain('line:10%');
    expect(vtt).toContain('line:90%');
    expect(vtt).toContain('HELLO');
  });
  it('normalizes SRT cues, removes duplicates, and clamps overlapping cue timing', () => {
    const vtt = normalizeSubtitleToVtt(`
1
00:00:01,000 --> 00:00:04,000
Hello

2
00:00:01,000 --> 00:00:04,000
Hello

3
00:00:03,000 --> 00:00:05,000
Next line
`);

    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect((vtt.match(/Hello/g) || []).length).toBe(1);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.950');
    expect(vtt).toContain('00:00:03.000 --> 00:00:05.000');
  });

  it('prefers normal sub-stream subtitles over dubtitles when watching dub', () => {
    const result = buildDubSubtitles(
      [
        { lang: 'en', label: 'English Dubtitles', url: 'dubtitles.vtt' },
        { lang: 'en', label: 'English CC', url: 'dub-cc.vtt' },
      ],
      [
        { lang: 'en', label: 'English', url: 'normal.vtt' },
      ],
    );

    expect(result).toEqual([
      { lang: 'en', label: 'English', url: 'normal.vtt' },
      { lang: 'en', label: 'English CC', url: 'dub-cc.vtt' },
    ]);
  });
});
