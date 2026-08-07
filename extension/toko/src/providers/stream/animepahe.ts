import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

const BASE_URL = 'https://animepahe.com';

interface AnimePaheSearchItem {
  session: string;
  title: string;
  id: number;
}

interface AnimePaheEpisode {
  session: string;
  episode: number;
  anime_session?: string;
}

interface AnimePaheEpisodeData {
  data?: AnimePaheEpisode[];
  last_page?: number;
}

interface AnimePaheSource {
  kwik: string;
  quality: string;
  audio: string;
}

const COOKIE_HEADERS = {
  Cookie: '__ddg1_=;__ddg2_=;av=1',
  Referer: `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function searchAnime(query: string): Promise<AnimePaheSearchItem[]> {
  try {
    const res = await __tatakai_fetch__(
      `${BASE_URL}/api?m=search&q=${encodeURIComponent(query)}`,
      { headers: COOKIE_HEADERS },
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: AnimePaheSearchItem[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function getEpisodes(animeSession: string, page = 1): Promise<AnimePaheEpisodeData> {
  try {
    const res = await __tatakai_fetch__(
      `${BASE_URL}/api?m=release&id=${animeSession}&sort=episode_asc&page=${page}`,
      { headers: COOKIE_HEADERS },
    );
    if (!res.ok) return {};
    return await res.json() as AnimePaheEpisodeData;
  } catch {
    return {};
  }
}

async function getEpisodeSources(animeSession: string, epSession: string): Promise<AnimePaheSource[]> {
  try {
    const res = await __tatakai_fetch__(
      `${BASE_URL}/api?m=links&id=${animeSession}&session=${epSession}&p=kwik`,
      { headers: COOKIE_HEADERS },
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: AnimePaheSource[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Kwik JS Unpacker ─────────────────────────────────────────────────────────

class UnBase {
  private readonly radix: number;
  private readonly alpha62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private alphabet = '';
  private dictionary: Record<string, number> = {};

  constructor(radix: number) {
    this.radix = radix;
    if (radix > 36) {
      if (radix <= 62) this.alphabet = this.alpha62.substring(0, radix);
      for (let i = 0; i < this.alphabet.length; i++) {
        this.dictionary[this.alphabet.charAt(i)] = i;
      }
    }
  }

  unBase(str: string): number {
    if (this.alphabet === '') return parseInt(str, this.radix);
    let ret = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(str.length - 1 - i);
      const value = this.dictionary[char];
      if (value !== undefined) ret += Math.pow(this.radix, i) * value;
    }
    return ret;
  }
}

function unpackKwikJs(packedJS: string): string | null {
  try {
    const exp = /\}\s*\('(.*)',\s*(.*?),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s;
    const matches = exp.exec(packedJS);
    if (!matches || matches.length !== 5) return null;

    let payload = matches[1]!.replace(/\\'/g, "'");
    const radix = parseInt(matches[2]!, 10) || 36;
    const count = parseInt(matches[3]!, 10) || 0;
    const symArray = matches[4]!.split('|');
    if (symArray.length !== count) return null;

    const unBase = new UnBase(radix);
    payload = payload.replace(/\b\w+\b/g, (word: string): string => {
      const index = unBase.unBase(word);
      return (index < symArray.length && symArray[index]) ? symArray[index] : word;
    });
    return payload;
  } catch {
    return null;
  }
}

async function extractDirectKwikStream(kwikUrl: string): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(kwikUrl, {
      headers: { Referer: `${BASE_URL}/`, 'User-Agent': COOKIE_HEADERS['User-Agent'] },
    });
    if (!res.ok) return null;
    const body = await res.text();

    const packedMatch = body.match(/eval\(function\(p,a,c,k,e,[rd].*?\)\)/s);
    if (packedMatch) {
      const unpacked = unpackKwikJs(packedMatch[0]);
      if (unpacked) {
        const sourceMatch = unpacked.match(/const\s+source\s*=\s*['"]([^'"]+)['"]/);
        if (sourceMatch?.[1] && sourceMatch[1].startsWith('http')) {
          return sourceMatch[1];
        }
      }
    }

    // Direct match if un-packed
    const directMatch = body.match(/source\s*:\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i);
    if (directMatch?.[1]) return directMatch[1];

    return null;
  } catch {
    return null;
  }
}

const provider: StreamProvider = {
  name: 'animepahe',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const queries = buildSearchQueries(opts.titles);

      for (const query of queries) {
        // 1. Search
        const animes = await searchAnime(query);
        if (animes.length === 0) continue;
        const anime = animes[0];

        // 2. Find episode
        let epSession: string | null = null;
        let page = 1;
        while (!epSession) {
          const epData = await getEpisodes(anime.session, page);
          const eps = epData.data ?? [];
          const match = eps.find(e => e.episode === targetEp);
          if (match) {
            epSession = match.session;
            break;
          }
          if (!epData.last_page || page >= epData.last_page) break;
          page++;
        }

        if (!epSession) continue;

        // 3. Get sources
        const sources = await getEpisodeSources(anime.session, epSession);
        if (sources.length === 0) continue;

        const results: SourceResult[] = [];
        for (const s of sources) {
          const directUrl = await extractDirectKwikStream(s.kwik);
          const streamUrl = directUrl || s.kwik;
          const isHls = streamUrl.includes('.m3u8');

          results.push({
            source: 'animepahe',
            url: streamUrl,
            quality: normalizeQuality(s.quality ?? ''),
            headers: { Referer: 'https://kwik.cx/' },
            subtitles: [],
            audioLanguage: s.audio === 'jpn' ? 'Japanese/Sub' : (s.audio || undefined),
            sourceType: isHls ? 'hls' : detectSourceType(streamUrl),
          });
        }

        if (results.length > 0) return results;
      }

      return [];
    } catch {
      return [];
    }
  },
};

export default provider;
