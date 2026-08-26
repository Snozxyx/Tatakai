import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { SourceOptions, SourceResult, StreamProvider } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';
import { buildSearchQueries } from '../../utils/scraping/title-normalizer.js';

const BASE = 'https://animeheaven.me';
const ANILIST_GRAPHQL = 'https://graphql.anilist.co';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

interface HeavenSearchResult {
  id: string;
  title: string;
}

interface HeavenEpisode {
  id: string;
  num: number;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreTitle(query: string, title: string): number {
  const needle = normalizeTitle(query);
  const hay = normalizeTitle(title);
  if (!needle || !hay) return 0;
  if (hay === needle) return 100;
  if (hay.startsWith(needle) || needle.startsWith(hay)) return 80;
  if (hay.includes(needle) || needle.includes(hay)) return 60;
  let matches = 0;
  for (const ch of needle) if (hay.includes(ch)) matches++;
  return Math.floor((matches / Math.max(needle.length, 1)) * 40);
}

async function fetchAniListTitles(anilistId: number): Promise<string[]> {
  try {
    const res = await fetchResponse(ANILIST_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } } }`,
        variables: { id: anilistId },
      }),
      timeoutMs: 6000,
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const t = data?.data?.Media?.title;
    const out = [t?.english, t?.romaji, t?.userPreferred, t?.native].filter((v): v is string => Boolean(v && v.trim()));
    return Array.from(new Set(out));
  } catch {
    return [];
  }
}

async function searchAnimeHeaven(query: string): Promise<HeavenSearchResult[]> {
  try {
    const res = await fetchResponse(`${BASE}/fastsearch.php?xhr=1&s=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*',
        Referer: `${BASE}/`,
      },
      timeoutMs: 7000,
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = loadHtml(html);
    const results: HeavenSearchResult[] = [];

    $.find('a[href*="anime.php?"]').each((_: number, el: any) => {
      const $el = $(el);
      const href = $el.attr('href') ?? '';
      const id = href.split('?')[1]?.trim();
      const title = ($el.find('.fastname').text() || $el.find('img').attr('alt') || '').trim();
      if (!id || !title) return;
      results.push({ id, title });
    });

    return results;
  } catch {
    return [];
  }
}

async function findAnimeHeavenId(titles: string[]): Promise<string | null> {
  const allResults: HeavenSearchResult[] = [];
  for (const query of buildSearchQueries(titles).slice(0, 8)) {
    const results = await searchAnimeHeaven(query);
    allResults.push(...results);
    if (results.some((r) => scoreTitle(query, r.title) >= 80)) break;
  }

  const unique = Array.from(new Map(allResults.map((r) => [r.id, r])).values());
  if (!unique.length) return null;

  const baseTitle = titles[0] || '';
  const best = unique
    .map((r) => ({ id: r.id, score: scoreTitle(baseTitle, r.title) }))
    .sort((a, b) => b.score - a.score)[0];

  return best && best.score >= 55 ? best.id : null;
}

async function getEpisodes(animeId: string): Promise<HeavenEpisode[]> {
  try {
    const res = await fetchResponse(`${BASE}/anime.php?${animeId}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*',
        Referer: `${BASE}/`,
      },
      timeoutMs: 8000,
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = loadHtml(html);
    const episodes: HeavenEpisode[] = [];

    $.find('a[onmouseover*="gateh("], a[onclick*="gatea("]').each((_: number, el: any) => {
      const $el = $(el);
      const attr = $el.attr('onmouseover') || $el.attr('onclick') || '';
      const key = attr.match(/gate[ha]\("([^"]+)"/)?.[1];
      const rawNum = ($el.find('.watch2').first().text() || '').trim();
      const num = Number(rawNum.replace(/^0+(\d)/, '$1'));
      if (!key || !Number.isFinite(num) || num <= 0) return;
      episodes.push({ id: key, num });
    });

    return Array.from(new Map(episodes.map((ep) => [ep.id, ep])).values()).sort((a, b) => a.num - b.num);
  } catch {
    return [];
  }
}

async function getStream(episodeId: string): Promise<string | null> {
  try {
    const res = await fetchResponse(`${BASE}/gate.php`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*',
        Referer: `${BASE}/`,
        Cookie: `key=${episodeId}`,
      },
      timeoutMs: 8000,
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = loadHtml(html);
    const sources = $.find('video source')
      .map((_: number, el: any) => ($(el).attr('src') ?? '').trim())
      .get()
      .filter((url: string) => /^https?:\/\//i.test(url));

    return sources.find((url: string) => url.includes('/video.mp4')) || sources[0] || null;
  } catch {
    return null;
  }
}

const provider: StreamProvider = {
  name: 'animeheaven',
  sites: [BASE],

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const targetEp = opts.episode ?? 1;
    const aniListTitles = opts.anilistId ? await fetchAniListTitles(opts.anilistId) : [];
    const titles = Array.from(new Set([...aniListTitles, ...(opts.titles || [])])).filter(Boolean);
    if (!titles.length) return [];

    const heavenId = await findAnimeHeavenId(titles);
    if (!heavenId) return [];

    const episodes = await getEpisodes(heavenId);
    const selected = episodes.find((ep) => ep.num === targetEp);
    if (!selected) return [];

    const streamUrl = await getStream(selected.id);
    if (!streamUrl) return [];

    return [{
      source: 'animeheaven',
      url: streamUrl,
      quality: normalizeQuality('HD'),
      headers: {
        Referer: `${BASE}/`,
        'User-Agent': UA,
      },
      subtitles: [],
      audioLanguage: 'ja',
      sourceType: 'mp4',
    }];
  },
};

export default provider;
