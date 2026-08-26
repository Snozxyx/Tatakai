/**
 * Nebula — primary stream provider.
 *
 * Upstream is justanime.to; `Nebula` is the name this app presents. The file
 * keeps its old path so the git history of the port stays contiguous.
 *
 * Ported from `TatakaiAPI/src/providers/preview.ts`, widened from "pick one
 * preview source" to "return every playable source", because this provider is
 * registered FIRST in `STREAM_PROVIDERS` and is what the watch page autoplays
 * on arrival.
 *
 *   GET https://core.justanime.to/api/watch/{anilistId}/episode/{ep}/{server}
 *   → { sub?: { sources[], tracks[], intro, outro, headers }, dub?: { … } }
 *
 * Why it is primary:
 *   - keyed by AniList id, so no title search / fuzzy match step (the slowest
 *     and most failure-prone part of every other provider);
 *   - one JSON round trip per server, typically <1s;
 *   - returns direct HLS from a CDN rather than an embed page, so it plays in
 *     the in-app player through the local proxy instead of a webview.
 *
 * Servers are tried in parallel and every distinct source is returned — the
 * host normalizes and the watch page ranks them. `megaplay` is listed first so
 * that when several resolve, provider order still favours the HLS one.
 */

import type { SourceOptions, SourceResult, StreamProvider, SubtitleTrack } from '../../types/index.js';
import { fetchResponse } from '../../utils/http/fetch.js';

const BASE_URL = 'https://core.justanime.to';
const SITE_ORIGIN = 'https://justanime.to';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/**
 * The API rejects requests without the site's own Origin/Referer and the
 * client-hint set a real Chrome sends — verbatim from the TatakaiAPI provider.
 */
const API_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  Origin: SITE_ORIGIN,
  Referer: `${SITE_ORIGIN}/`,
  'User-Agent': UA,
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Brave";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Sec-GPC': '1',
};

/** Servers in priority order. `megaplay` yields HLS, `animegg` MP4. */
const SERVERS = ['megaplay', 'animegg'] as const;

interface JustAnimeSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
  headers?: Record<string, string>;
}

interface JustAnimeTrack {
  file?: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

interface JustAnimeStream {
  sources?: JustAnimeSource[];
  subtitles?: JustAnimeTrack[];
  tracks?: JustAnimeTrack[];
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  headers?: Record<string, string>;
}

interface JustAnimeResponse {
  sub?: JustAnimeStream;
  dub?: JustAnimeStream;
}

const isHlsUrl = (url: string) => /\.m3u8($|[?#/])/i.test(url);

/** `https://megaplay.buzz/` → `https://megaplay.buzz`. Empty when unparseable. */
function originOf(referer: string): string {
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

/** One server's payload. Never throws — a dead server is just no sources. */
async function fetchServer(
  anilistId: number,
  episode: number,
  server: string,
  timeoutMs: number,
): Promise<JustAnimeResponse | null> {
  try {
    const res = await fetchResponse(
      `${BASE_URL}/api/watch/${anilistId}/episode/${episode}/${server}`,
      { headers: API_HEADERS, timeoutMs },
    );
    if (!res.ok) return null;
    return (await res.json()) as JustAnimeResponse;
  } catch {
    return null;
  }
}

/** `tracks`/`subtitles` → the app's SubtitleTrack shape, thumbnails dropped. */
function mapSubtitles(stream: JustAnimeStream): SubtitleTrack[] {
  const raw = [...(stream.subtitles || []), ...(stream.tracks || [])];
  const out: SubtitleTrack[] = [];
  const seen = new Set<string>();

  for (const t of raw) {
    const file = String(t?.file || '').trim();
    if (!file) continue;
    const kind = String(t?.kind || '').toLowerCase();
    const label = String(t?.label || '').trim();
    // JustAnime ships the seek-preview sprite in the same array.
    if (kind === 'thumbnails' || /thumbnail/i.test(label) || /thumbnails/i.test(file)) continue;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({
      url: file,
      label: label || 'Subtitle',
      language: label || 'English',
      default: t?.default === true,
    });
  }
  return out;
}

/**
 * Every distinct source in one `sub`/`dub` stream object, best first.
 *
 * `pickSource()` in the TatakaiAPI original returned a single URL because it
 * only fed hover previews. Playback wants the full ladder so the player can
 * fail over between qualities without another scrape.
 */
function mapSources(
  stream: JustAnimeStream | undefined,
  server: string,
  audio: 'sub' | 'dub',
): SourceResult[] {
  if (!stream?.sources?.length) return [];

  const streamHeaders = stream.headers || {};
  const QUALITY_RANK = ['1080p', '720p', '480p', '360p'];

  const ranked = [...stream.sources]
    .filter((s) => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url))
    .sort((a, b) => {
      const aHls = a.isM3U8 === true || isHlsUrl(a.url) ? 0 : 1;
      const bHls = b.isM3U8 === true || isHlsUrl(b.url) ? 0 : 1;
      if (aHls !== bHls) return aHls - bHls;
      const aq = QUALITY_RANK.indexOf(String(a.quality || ''));
      const bq = QUALITY_RANK.indexOf(String(b.quality || ''));
      return (aq === -1 ? 99 : aq) - (bq === -1 ? 99 : bq);
    });

  const subtitles = mapSubtitles(stream);
  const seen = new Set<string>();
  const out: SourceResult[] = [];

  for (const s of ranked) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const hls = s.isM3U8 === true || isHlsUrl(s.url);

    // The CDN (cdn.watching.onl) validates Referer: it 403s a Cloudflare
    // challenge page for `https://justanime.to/` but serves 200 for the player
    // host the API hands back in `stream.headers.Referer`
    // (e.g. `https://megaplay.buzz/`). So the per-stream headers win over the
    // site defaults, and Origin has to be derived from whichever Referer ends up
    // in force — sending justanime.to's Origin alongside megaplay's Referer is
    // the mismatch that produced the original 403.
    const headers: Record<string, string> = {
      Referer: `${SITE_ORIGIN}/`,
      'User-Agent': UA,
      ...streamHeaders,
      ...(s.headers || {}),
    };
    const origin = originOf(headers.Referer || headers.referer || '');
    if (origin) headers.Origin = origin;

    out.push({
      // `source` is what the UI labels the button with, so it names the server
      // and audio track rather than the provider — matching how animeya/reanime
      // name theirs (`animeya-vidnest-sub`).
      source: `nebula-${server}-${audio}`,
      url: s.url,
      quality: String(s.quality || (hls ? 'auto' : 'HD')),
      // These must travel with the source — the host registers them with the
      // local proxy so playback replays the exact request the CDN accepted.
      headers,
      subtitles,
      audioLanguage: audio === 'dub' ? 'en' : 'ja',
      language: audio === 'dub' ? 'English' : 'Japanese',
      sourceType: hls ? 'hls' : 'mp4',
      // Display name is capitalised; `providerKey` stays lowercase because the
      // host derives it by lowercasing and every consumer matches on it that way.
      providerName: 'Nebula',
      providerKey: 'nebula',
      server: `nebula-${server}-${audio}`,
    });
  }

  return out;
}

const provider: StreamProvider = {
  // Registry name — this is what the diagnostics table and provider_status events
  // report. The upstream site is still justanime.to (see SITE_ORIGIN); only the
  // name this app presents is Nebula.
  name: 'nebula',

  // API host first — that is what resolution actually calls; the public site is
  // listed second because it is the origin the API is fronted by.
  sites: [BASE_URL, SITE_ORIGIN],

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const anilistId = Number(opts.anilistId);
    // Keyed purely by AniList id — no titles, no search. When the caller has no
    // AniList id there is nothing this provider can do.
    if (!Number.isFinite(anilistId) || anilistId <= 0) return [];

    const episode = opts.episode ?? 1;
    // Two cheap JSON calls: run them together so a dead server costs nothing.
    const timeoutMs = Math.max(4000, Math.min(12000, opts.providerOptions?.timeoutMs ?? 10000));

    const responses = await Promise.all(
      SERVERS.map((server) => fetchServer(anilistId, episode, server, timeoutMs)),
    );

    const out: SourceResult[] = [];
    responses.forEach((data, i) => {
      if (!data) return;
      const server = SERVERS[i];
      // Sub first: it is the default audio the watch page opens on.
      out.push(...mapSources(data.sub, server, 'sub'));
      out.push(...mapSources(data.dub, server, 'dub'));
    });

    return out;
  },

  async movie(opts: SourceOptions): Promise<SourceResult[]> {
    // Movies are episode 1 on this API.
    return provider.single({ ...opts, episode: opts.episode ?? 1 });
  },
};

export default provider;
