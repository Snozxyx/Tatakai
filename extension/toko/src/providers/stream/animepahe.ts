import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

// animepahe.com now 30x-redirects to a rotating mirror (animepahe.pw, .ru, .ac).
// The extension worker follows redirects but some mirrors reject requests
// without a browser UA, so we try the canonical domain first then mirrors.
const BASE_URLS = ['https://animepahe.com', 'https://animepahe.pw', 'https://animepahe.ru', 'https://animepahe.ac'];

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

function headersFor(base: string, path = '/'): Record<string, string> {
  return {
    Cookie: '__ddg1_=;__ddg2_=;av=1',
    Referer: `${base}${path}`,
    Origin: base,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * GET a JSON API path across the known animepahe mirrors, returning the first
 * successful JSON body. Mirrors occasionally 5xx or rotate; this keeps the
 * provider resilient without forcing the worker to chase redirects.
 */
async function apiGetJson<T>(path: string): Promise<T | null> {
  for (const base of BASE_URLS) {
    try {
      const res = await __tatakai_fetch__(`${base}${path}`, { headers: headersFor(base, path.split('?')[0]) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text) continue;
      try {
        return JSON.parse(text) as T;
      } catch {
        // Some mirrors return an HTML interstitial; try the next mirror.
        continue;
      }
    } catch {
      // try next mirror
    }
  }
  return null;
}

async function searchAnime(query: string): Promise<AnimePaheSearchItem[]> {
  const data = await apiGetJson<{ data?: AnimePaheSearchItem[] }>(
    `/api?m=search&l=8&q=${encodeURIComponent(query)}`,
  );
  return data?.data ?? [];
}

async function getEpisodes(animeSession: string, page = 1): Promise<AnimePaheEpisodeData> {
  const data = await apiGetJson<AnimePaheEpisodeData>(
    `/api?m=release&id=${animeSession}&sort=episode_asc&page=${page}`,
  );
  return data ?? {};
}

async function getEpisodeSources(animeSession: string, epSession: string): Promise<AnimePaheSource[]> {
  // The legacy m=links endpoint now requires a numeric anime id and returns
  // "not enough arguments" when given a session UUID. The /play/{anime}/{ep}
  // page renders the Kwik buttons server-side, so scrape the embed URLs from
  // there instead.
  for (const base of BASE_URLS) {
    try {
      const res = await __tatakai_fetch__(`${base}/play/${animeSession}/${epSession}`, {
        headers: headersFor(base, `/anime/${animeSession}`),
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Play page links look like <a class="..." href="https://kwik.cx/e/...">
      // or data-src attributes pointing at kwik/pahewin embeds.
      const sources: AnimePaheSource[] = [];
      const seen = new Set<string>();
      const re = /https?:\/\/(kwik\.[a-z]+|pahe\.win|kwik\.cx)\/e\/[A-Za-z0-9_-]+/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        const u = m[0];
        if (seen.has(u)) continue;
        seen.add(u);
        sources.push({ kwik: u, quality: 'auto', audio: 'japanese' });
      }
      if (sources.length > 0) return sources;
    } catch { /* try next mirror */ }
  }
  return [];
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
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const res = await __tatakai_fetch__(kwikUrl, {
      headers: { Referer: 'https://kwik.cx/', 'User-Agent': ua },
    });
    if (!res.ok) return null;
    const body = await res.text();

    // 1. P.A.C.K.E.R.-obfuscated script: eval(function(p,a,c,k,e,d){...})
    const packedMatch = body.match(/eval\(function\(p,a,c,k,e,[rd].*?\)\)/s);
    if (packedMatch) {
      const unpacked = unpackKwikJs(packedMatch[0]);
      if (unpacked) {
        // Newer kwik player assigns `const source = "..."` directly.
        const sourceMatch =
          unpacked.match(/const\s+source\s*=\s*['"]([^'"]+)['"]/) ||
          unpacked.match(/source\s*=\s*['"](https?:\/\/[^'"]+)['"]/);
        if (sourceMatch?.[1] && sourceMatch[1].startsWith('http')) {
          return sourceMatch[1];
        }
      }
    }

    // 2. Direct match if the source is already un-packed (jwplayer config etc.)
    const directMatch = body.match(/source\s*:\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i);
    if (directMatch?.[1]) return directMatch[1];

    // 3. Loose m3u8/mp4 URL inside a script.
    const loose = body.match(/["'`](https?:\/\/[^"'`\s]+\.(?:m3u8|mp4)[^"'`\s]*)["'`]/i);
    if (loose?.[1]) return loose[1];

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
