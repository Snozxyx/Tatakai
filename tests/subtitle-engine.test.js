import { describe, expect, it } from 'bun:test';
import { normalizeSubtitleToVtt } from '../src/core/player/subtitle-utils.ts';
import { buildDubSubtitles } from '../src/lib/watch/sourceIntelligence.ts';

describe('subtitle engine utilities', () => {
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
