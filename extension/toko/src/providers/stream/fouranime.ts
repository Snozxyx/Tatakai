import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://4anime.com.ro';
const API = 'https://4anime.com.ro/ajax';

const COMMON_HEADERS = {
  Referer: `${BASE}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
};

interface SearchResult {
  animeid: string;
  title: string;
}

interface EpisodeItem {
  epId: string;
  number: number;
}

interface ServerItem {
  type: string;
  name: string;
  serverId: string;
  id: string;
}

async function search(keyword: string): Promise<SearchResult[]> {
  try {
    const res = await __tatakai_fetch__(
      `${API}/search/suggest?keyword=${encodeURIComponent(keyword)}`,
      { headers: COMMON_HEADERS },
    );
    if (!res.ok) return [];
    const data = await res.json() as { status: boolean; html: string };
    if (!data?.html) return [];

    const $ = __tatakai_parse_html__(data.html);
    const results: SearchResult[] = [];

    $.find('div.item').each((_: number, el: any) => {
      const link = el.find('div.anime_info h3.anime_name a');
      const title = (typeof link.text === 'function' ? link.text() : link.text ?? '').trim();
      const href = typeof link.attr === 'function' ? link.attr('href') : '';
      const slug = (href ?? '').split('/').pop()?.split('?')[0] ?? '';
      const animeid = slug.split('-').pop() ?? '';
      if (animeid) results.push({ animeid, title });
    });

    return results;
  } catch {
    return [];
  }
}

async function findEpisodes(animeid: string): Promise<EpisodeItem[]> {
  try {
    const res = await __tatakai_fetch__(`${API}/episode/list/${animeid}`, {
      headers: COMMON_HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json() as { status: boolean; html: string };
    if (!data?.html) return [];

    const $ = __tatakai_parse_html__(data.html);
    const episodes: EpisodeItem[] = [];

    $.find('li.ep-item').each((_: number, el: any) => {
      const epId = typeof el.attr === 'function' ? el.attr('data-id') : '';
      const linkEl = el.find('a');
      const text = typeof linkEl.text === 'function' ? linkEl.text().trim() : '';
      const number = parseInt(text) || 0;
      if (epId && number > 0) episodes.push({ epId, number });
    });

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  } catch {
    return [];
  }
}

async function getServers(episodeId: string): Promise<ServerItem[]> {
  try {
    const res = await __tatakai_fetch__(`${API}/episode/servers?episodeId=${episodeId}`, {
      headers: COMMON_HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json() as { html: string };
    const $ = __tatakai_parse_html__(data.html);
    const servers: ServerItem[] = [];

    $.find('.servers-sub .server-item, .servers-dub .server-item').each((_: number, el: any) => {
      const type = typeof el.attr === 'function' ? el.attr('data-type') ?? '' : '';
      const name = (el.find('.btn').text?.() ?? '').trim();
      const serverId = typeof el.attr === 'function' ? el.attr('data-server-id') ?? '' : '';
      const id = typeof el.attr === 'function' ? el.attr('data-id') ?? '' : '';
      if (id) servers.push({ type, name, serverId, id });
    });

    return servers;
  } catch {
    return [];
  }
}

async function getSources(serverId: string): Promise<{ embedUrl: string } | null> {
  try {
    const res = await __tatakai_fetch__(`${API}/episode/sources?id=${serverId}`, {
      headers: COMMON_HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json() as { link: string };
    return data.link ? { embedUrl: data.link } : null;
  } catch {
    return null;
  }
}

async function resolveEmbed(embedUrl: string): Promise<{ url: string; subtitles: SubtitleTrack[] }[]> {
  try {
    // Extract sourceId from embed URL and call getSources
    const urlObj = new URL(embedUrl);
    const sourceId = urlObj.pathname.split('/').pop() ?? '';
    const base = embedUrl.split(sourceId)[0];

    const res = await __tatakai_fetch__(`${base}getSources?id=${sourceId}`, {
      headers: { Referer: embedUrl },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      sources?: Array<{ file: string; type: string }>;
      tracks?: Array<{ file: string; label: string; default?: boolean }>;
    };

    if (!data.sources?.length) return [];

    const subtitles: SubtitleTrack[] = (data.tracks ?? []).map((t, i) => ({
      url: t.file,
      label: t.label,
      language: t.label,
      default: t.default ?? false,
    }));

    return data.sources.map(s => ({ url: s.file, subtitles }));
  } catch {
    return [];
  }
}

const provider: StreamProvider = {
  name: '4anime',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const title = opts.titles[0] ?? '';
      const targetEp = opts.episode ?? 1;

      // 1. Search
      const searchResults = await search(title);
      if (searchResults.length === 0) return [];
      const { animeid } = searchResults[0];

      // 2. Get episode list
      const episodes = await findEpisodes(animeid);
      if (episodes.length === 0) return [];
      const episode = episodes.find(e => e.number === targetEp) ?? episodes[0];

      // 3. Get servers for episode
      const servers = await getServers(episode.epId);
      if (servers.length === 0) return [];

      // Prefer sub servers; pick Vidstreaming first, then any
      const subServers = servers.filter(s => s.type === 'sub');
      const pool = subServers.length > 0 ? subServers : servers;
      const selected =
        pool.find(s => s.name === 'Vidstreaming') ??
        pool.find(s => s.serverId === '4') ??
        pool[0];

      // 4. Get embed URL
      const sourceData = await getSources(selected.id);
      if (!sourceData) return [];

      // 5. Resolve embed to final m3u8/mp4
      const streamSources = await resolveEmbed(sourceData.embedUrl);
      if (streamSources.length === 0) return [];

      return streamSources.map(s => ({
        source: '4anime',
        url: s.url,
        quality: normalizeQuality(''),
        headers: {
          Referer: 'https://rapid-cloud.co/',
          Origin: 'https://rapid-cloud.co',
        },
        subtitles: s.subtitles,
        sourceType: detectSourceType(s.url),
      }));
    } catch {
      return [];
    }
  },
};

export default provider;
