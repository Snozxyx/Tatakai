import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseReleaseName } = require('../desktop/runtime/torrent/naming/release-parser.cjs');

describe('release parser fixture regression pack', () => {
  const fixtures = [
    {
      input: '[Team246] Ghost in the shell Stand alone complex S01 E10-E15 [BDREMUX 1080P MULTi DTSHDMA 5.1][VOSTFR]',
      expectTitleIncludes: 'Ghost in the shell Stand alone complex',
      expectSeason: 1,
      expectEpisode: 10,
      expectRangeEnd: 15,
      expectSource: 'BluRay',
      expectResolution: '1080p',
    },
    {
      input: 'Naruto Shippuden 163 Remaster (BDRip 1080p x265 FLAC Multi) - Ryūjin 竜神',
      expectTitleIncludes: 'Naruto Shippuden',
      expectEpisode: 163,
      expectResolution: '1080p',
    },
    {
      input: '[DKB] Synduality Noir - S01E03 [1080p][HEVC x265 10bit][Multi-Subs]',
      expectTitleIncludes: 'Synduality Noir',
      expectSeason: 1,
      expectEpisode: 3,
      expectResolution: '1080p',
    },
    {
      input: 'Frieren.Beyond.Journeys.End.S02E06.A.Demon-Slaying.Request.1080p.BILI.WEB-DL.JPN.AAC2.0.H.265.MSubs-ToonsHub.mkv',
      expectTitleIncludes: 'Frieren Beyond Journeys End',
      expectSeason: 2,
      expectEpisode: 6,
      expectResolution: '1080p',
      expectSource: 'WEB-DL',
    },
    {
      input: 'Cosmic.Princess.Kaguya.2026.REPACK.1080p.NF.WEB-DL.DUAL.DDP5.1.H.264-VARYG.mkv',
      expectTitleIncludes: 'Cosmic Princess Kaguya',
      expectResolution: '1080p',
      expectSource: 'WEB-DL',
    },
    {
      input: '[Sick-Fansubs] One Piece 1161 [1080p][0DE48D35].mp4',
      expectTitleIncludes: 'One Piece',
      expectEpisode: 1161,
      expectResolution: '1080p',
    },
    {
      input: '[m.3.3.w] Hanasakeru Seishounen 12.5 (XviD) [89BACFB9].avi',
      expectTitleIncludes: 'Hanasakeru Seishounen',
      expectSource: undefined,
    },
    {
      input: '[HorribleSubs] Re Zero kara Hajimeru Isekai Seikatsu - 01A [1080p].mkv',
      expectTitleIncludes: 'Re Zero kara Hajimeru Isekai Seikatsu',
      expectEpisode: 1,
      expectResolution: '1080p',
    },
    {
      input: 'Some.Show.S03E04.1080p.CR.WEB-DL.Dual-Audio.AAC2.0.H.264-SomeGroup.mkv',
      expectTitleIncludes: 'Some Show',
      expectSeason: 3,
      expectEpisode: 4,
      expectResolution: '1080p',
      expectSource: 'WEB-DL',
    },
    {
      input: 'Anime Name - S00E01 - Title of the Episode (AMZN WEB-DL 1080p H.264 EAC3) [Dual Audio] [Group].mkv',
      expectTitleIncludes: 'Anime Name',
      expectSeason: 0,
      expectEpisode: 1,
      expectResolution: '1080p',
      expectSource: 'WEB-DL',
    },
    {
      input: 'Anime Name (2022) - S01E01 - (BD Remux 1080p HEVC FLAC) [Dual Audio]-Group.mkv',
      expectTitleIncludes: 'Anime Name',
      expectSeason: 1,
      expectEpisode: 1,
      expectResolution: '1080p',
      expectSource: 'BluRay',
    },
  ];

  for (const fixture of fixtures) {
    it(`parses: ${fixture.input}`, () => {
      const parsed = parseReleaseName(fixture.input);
      expect(parsed.title).toBeTruthy();
      expect(parsed.title).toContain(fixture.expectTitleIncludes);
      if (fixture.expectSeason != null) expect(parsed.season).toBe(fixture.expectSeason);
      if (fixture.expectEpisode != null) expect(parsed.episodeNumber).toBe(fixture.expectEpisode);
      if (fixture.expectRangeEnd != null) expect(parsed.episodeEnd).toBe(fixture.expectRangeEnd);
      if (fixture.expectResolution != null) expect(parsed.resolution).toBe(fixture.expectResolution);
      if (fixture.expectSource !== undefined) expect(parsed.source).toBe(fixture.expectSource);
      if (fixture.expectTitleExcludes) {
        for (const text of fixture.expectTitleExcludes) {
          expect(parsed.title).not.toContain(text);
        }
      }
      if (/remux/i.test(fixture.input)) expect(parsed.remux).toBe(true);
      if (/AMZN/i.test(fixture.input)) expect(parsed.sourceTag).toBe('AMZN');
      if (/S00E/i.test(fixture.input)) expect(parsed.isSpecial).toBe(true);
      expect(parsed.confidence).toBeGreaterThan(40);
    });
  }
});

