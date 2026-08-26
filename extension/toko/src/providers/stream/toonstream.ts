/**
 * ToonStream — scraper adapter (https://toonstream.one)
 *
 * Series:  /series/{slug}
 * Episode: /episode/{slug}-{season}x{episode}/
 * Embeds:  each episode page lists multiple server iframes → resolved via
 *          per-host scrapers in ./toonstream/embed/
 *
 * Language note: ToonStream is a South-Asian dub site. The majority of servers
 * carry Hindi, Telugu, Tamil or "Multi Audio" tracks — NOT English. Language is
 * detected per-embed via detectEmbedLanguage().
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries, scoreMatch, slugifyTitle } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';
import { resolveAsCdnSource } from './toonstream/embed/as-cdn.js';
import { resolveRubystmSource, RUBYSTM_ORIGIN } from './toonstream/embed/rubystm.js';
import { resolveMultiEmbed, detectEmbedLanguage } from './toonstream/embed/multi-embed.js';

const PRIMARY = 'https://toonstream.one';
const MIRRORS = [
  PRIMARY,
  'https://toonstream.co',
  'https://toonstream.day',
  'https://toonstream.link',
  'https://toon-stream.site',
  'https://toonstream.net',
];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function tryFetch(
  target: string,
  referer?: string,
): Promise<{ html: string; base: string } | null> {
  try {
    const origin = new URL(target).origin;
    const res = await fetchResponse(target, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        Referer: referer ?? `${origin}/`,
      },
      timeoutMs: 5000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const looksValid =
      html.length > 200 &&
      /\/series\/|\/episode\/|entry-title|<iframe|embed|jwplayer|Video|aa-options|aa-tbs/i.test(html);
    if (!looksValid) return null;
    return { html, base: origin };
  } catch {
    return null;
  }
}

async function fetchHtml(
  url: string,
  referer?: string,
): Promise<{ html: string; base: string } | null> {
  if (url.startsWith('http')) return tryFetch(url, referer);

  const primary = await tryFetch(`${PRIMARY}${url}`, referer);
  if (primary) return primary;

  const settled = await Promise.allSettled(
    MIRRORS.slice(1).map(b => tryFetch(`${b}${url}`, referer)),
  );
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) return result.value;
  }
  return null;
}

function resolveUrl(href: string, base: string, pageUrl: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return new URL(href, pageUrl || `${base}/`).toString();
}

function findEpisodeHref(html: string, slug: string, season: number, ep: number): string | null {
  const patterns = [
    new RegExp(`href="(/episode/${slug}-${season}x${ep}/?)"`, 'i'),
    new RegExp(`href="(/episode/${slug}-ep-${ep}/?)"`, 'i'),
    new RegExp(`href="(/episode/${slug}-${ep}/?)"`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Extract the server/language label from an embed container element. */
function getServerLabel(el: any): string {
  return (
    el.attr?.('data-server') ??
    el.attr?.('title') ??
    el.text?.() ??
    ''
  ).trim();
}

/** Collect embed URLs from an episode page, preserving server name hints. */
function collectEpisodeEmbedUrls(
  html: string,
  base: string,
  pageUrl: string,
): Array<{ url: string; serverName: string }> {
  const out: Array<{ url: string; serverName: string }> = [];
  const seen = new Set<string>();

  const add = (raw: string, serverName: string) => {
    const url = resolveUrl(raw, base, pageUrl);
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    if (/googletagmanager|recaptcha|doubleclick/i.test(url)) return;
    seen.add(url);
    out.push({ url, serverName });
  };

  const $ = loadHtml(html);

  // ── New ToonStream structure (2025+) ──────────────────────────────────────
  // Server tabs: .aa-tbs-video a[href="#options-N"] .server  (server name)
  // Player containers: div#aa-options .video.aa-tb iframe[src|data-src]

  // Build a map of options-N → server name from the tab buttons
  const serverNames: Record<string, string> = {};
  $.find('.aa-tbs-video a[href]').each((_: number, el: any) => {
    const href: string = el.attr?.('href') ?? '';
    const idMatch = href.match(/^#(options-\d+)$/);
    if (!idMatch) return;
    const name: string = (
      el.find?.('.server')?.text?.() ??
      el.attr?.('data-server') ??
      el.text?.() ??
      ''
    ).trim();
    serverNames[idMatch[1]] = name;
  });

  // Extract iframes from the video containers
  $.find('#aa-options .video iframe, div[id^="options-"] iframe').each((_: number, el: any) => {
    const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
    if (!src || /about:blank/i.test(src)) return;
    // Resolve the container id to get the server name
    const containerId: string = el.closest?.('[id^="options-"]')?.attr?.('id') ?? '';
    const name = serverNames[containerId] ?? '';
    add(src.startsWith('/') ? `${base}${src}` : src, name);
  });

  if (out.length > 0) return out;

  // ── Legacy structure fallback: aside#aa-options iframe ────────────────────
  $('aside#aa-options iframe').each((_: number, el: any) => {
    const src = el.attr?.('data-src') ?? el.attr?.('src') ?? '';
    const label = getServerLabel(el);
    const url = src.startsWith('/') ? `${base}${src}` : src;
    if (url) add(url, label);
  });

  // Server tab buttons
  if (out.length === 0) {
    $('ul.aa-series-servers li a, .servers-tabs a, a[data-server]').each((_: number, el: any) => {
      const href = el.attr?.('href') ?? el.attr?.('data-url') ?? '';
      const label = getServerLabel(el);
      if (href) add(href, label);
    });
  }

  // Generic iframes
  if (out.length === 0) {
    $.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
      const src = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (/about:blank|youtube\.com\/embed/i.test(src)) return;
      add(src, getServerLabel(el));
    });
  }

  // Raw regex fallback
  if (out.length === 0) {
    for (const m of html.matchAll(/<iframe[^>]*(?:src|data-src)=["']([^"']+)["']/gi)) {
      if (/about:blank|youtube\.com\/embed/i.test(m[1])) continue;
      add(m[1], '');
    }
  }

  return out;
}

async function followToPlayerIframe(
  embedUrl: string,
  referer: string,
): Promise<string | null> {
  const page = await fetchHtml(embedUrl, referer);
  if (!page) return null;

  const $ = loadHtml(page.html);
  const iframe =
    $('.Video iframe').attr('src') ||
    $('iframe[src]').first().attr('src') ||
    $('iframe[data-src]').first().attr('data-src');

  if (iframe) return resolveUrl(iframe, page.base, embedUrl);

  const m = page.html.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m?.[1] ? resolveUrl(m[1], page.base, embedUrl) : null;
}

/** Embed-URL → SourceResult[], using specialised resolvers per host. */
async function resolvePlayerUrl(
  playerUrl: string,
  embedReferer: string,
  serverName: string,
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  const lang = detectEmbedLanguage(playerUrl, serverName);

  // Helper: always add embed URL as a custom fallback source
  const embedFallback = (source: string): SourceResult => ({
    source,
    url: playerUrl,
    quality: normalizeQuality('720p'),
    headers: { Referer: embedReferer, 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'custom',
  });

  // as-cdn resolver
  if (/as-cdn\d+\.top\/video\//i.test(playerUrl)) {
    const resolved = await resolveAsCdnSource(playerUrl, embedReferer);
    if (resolved) results.push({ ...resolved, ...lang });
    // as-cdn always has a valid direct stream — no embed fallback needed
    return results;
  }

  // rubystm resolver — also always emit the embed URL for WebView fallback
  if (/rubystm\.com/i.test(playerUrl)) {
    const resolved = await resolveRubystmSource(playerUrl, embedReferer);
    if (resolved && resolved.sourceType !== 'custom') {
      results.push({ ...resolved, ...lang });
    }
    // Always include embed URL for WebView
    results.push(embedFallback('toonstream'));
    return results;
  }

  // Multi-embed resolver (emturbovid, blakiteapi, vidmoly, strmup, abyss, cloudy, gdmirror)
  const multiResult = await resolveMultiEmbed(playerUrl, embedReferer);
  if (multiResult) {
    const resolvedLang = detectEmbedLanguage(playerUrl, serverName);
    const isDirectStream = multiResult.sourceType === 'hls' || multiResult.sourceType === 'mp4';
    // Add the extracted stream (could be hls, mp4, or another custom embed)
    results.push({ ...multiResult, ...resolvedLang });
    // If extraction yielded a real stream, also add original embed URL as fallback
    if (isDirectStream) {
      results.push({
        ...embedFallback(multiResult.source),
        url: playerUrl, // original embed URL (different from extracted stream URL)
      });
    }
    return results;
  }

  // Direct m3u8 in URL
  const m3u8 = playerUrl.match(/https?:\/\/[^\s"'<>]+\.m3u8/i);
  if (m3u8) {
    results.push({
      source: 'toonstream',
      url: m3u8[0],
      quality: normalizeQuality('HD'),
      headers: { Referer: embedReferer, 'User-Agent': UA },
      subtitles: [],
      ...lang,
      sourceType: 'hls',
    });
    return results;
  }

  // Generic custom fallback — just emit the embed URL
  results.push(embedFallback('toonstream'));
  return results;
}

async function resolveEpisodeSources(epPath: string, referer: string): Promise<SourceResult[]> {
  const page = await fetchHtml(epPath, referer);
  if (!page) return [];

  const pageUrl = epPath.startsWith('http') ? epPath : `${page.base}${epPath}`;
  const embedEntries = collectEpisodeEmbedUrls(page.html, page.base, pageUrl);

  // ── Step 1: Resolve /embed/ wrappers in parallel (capped at 4 concurrent) ──
  const playerEntries: Array<{ playerUrl: string; embedReferer: string; serverName: string }> = [];
  const seenPlayers = new Set<string>();

  const KNOWN_PLAYER = /as-cdn|rubystm|emturbovid|strmup|blakite|vidmoly|abyssplayer|cloudy|gdmirror/i;

  // Partition: wrappers need a follow step, known players go direct
  const wrappers: Array<{ url: string; serverName: string }> = [];
  for (const { url: embedUrl, serverName } of embedEntries) {
    if (/\/embed\//i.test(embedUrl) && !KNOWN_PLAYER.test(embedUrl)) {
      wrappers.push({ url: embedUrl, serverName });
    } else if (!seenPlayers.has(embedUrl)) {
      seenPlayers.add(embedUrl);
      playerEntries.push({ playerUrl: embedUrl, embedReferer: pageUrl, serverName });
    }
  }

  // Follow wrappers in parallel batches of 4
  const BATCH = 4;
  for (let i = 0; i < wrappers.length; i += BATCH) {
    const slice = wrappers.slice(i, i + BATCH);
    const resolved = await Promise.allSettled(
      slice.map(({ url, serverName }) =>
        followToPlayerIframe(url, pageUrl).then(player => ({ player, embedReferer: url, serverName }))
      )
    );
    for (const r of resolved) {
      if (r.status !== 'fulfilled' || !r.value.player) continue;
      const { player, embedReferer, serverName } = r.value;
      if (!seenPlayers.has(player)) {
        seenPlayers.add(player);
        playerEntries.push({ playerUrl: player, embedReferer, serverName });
      }
    }
  }

  // ── Step 2: Resolve players in parallel, return on first real m3u8/mp4 ──
  const results: SourceResult[] = [];
  const seenUrls = new Set<string>();

  // Process in parallel batches of 4; stop early once we have ≥1 direct stream
  for (let i = 0; i < playerEntries.length; i += BATCH) {
    const slice = playerEntries.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map(({ playerUrl, embedReferer, serverName }) =>
        resolvePlayerUrl(playerUrl, embedReferer, serverName)
      )
    );
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const src of r.value) {
        if (!seenUrls.has(src.url)) {
          seenUrls.add(src.url);
          results.push(src);
        }
      }
    }
    // Return early if we have at least one direct stream (not just custom embeds)
    const hasDirectStream = results.some(s => s.sourceType === 'hls' || s.sourceType === 'mp4');
    if (hasDirectStream) return results;
  }

  if (results.length > 0) return results;

  // Legacy single-embed fallback
  const embedMatch = page.html.match(/(?:src|data-src)=["'](\/embed\/[^"']+)["']/i);
  if (embedMatch) {
    const embedUrl = resolveUrl(embedMatch[1], page.base, pageUrl);
    const player = await followToPlayerIframe(embedUrl, pageUrl);
    if (player) {
      const batch = await resolvePlayerUrl(player, embedUrl, '');
      for (const src of batch) {
        if (!seenUrls.has(src.url)) results.push(src);
      }
    }
  }

  return results;
}

async function findSeriesSlug(titles: string[]): Promise<{ slug: string; base: string } | null> {
  // Try all queries and all mirrors in parallel, return first hit
  const queries = buildSearchQueries(titles).slice(0, 2);

  // Fast path: probe direct slugs across all mirrors simultaneously
  const slugAttempts: Promise<{ slug: string; base: string } | null>[] = [];
  for (const query of queries) {
    const slug = slugifyTitle(query);
    if (slug) {
      for (const base of MIRRORS.slice(0, 3)) {
        slugAttempts.push(
          tryFetch(`${base}/series/${slug}`, `${base}/`).then(page =>
            page && /series|episode/i.test(page.html) ? { slug, base } : null
          )
        );
      }
    }
  }

  const slugResults = await Promise.allSettled(slugAttempts);
  for (const r of slugResults) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }

  // Search fallback: try primary mirror only to keep it fast
  for (const query of queries) {
    const searchPage = await fetchHtml(`/home/?s=${encodeURIComponent(query)}`);
    if (!searchPage) continue;

    const $ = loadHtml(searchPage.html);
    const hits: Array<{ slug: string; title: string; score: number }> = [];

    $.find('a[href*="/series/"]').each((_: number, el: any) => {
      const href: string = el.attr?.('href') ?? '';
      const m = href.match(/\/series\/([^/?#]+)/);
      if (!m) return;
      const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
      if (!title) return;
      hits.push({ slug: m[1], title, score: scoreMatch(query, title) });
    });

    if (hits.length > 0) {
      hits.sort((a, b) => b.score - a.score);
      return { slug: hits[0].slug, base: searchPage.base };
    }
  }
  return null;
}

const provider: StreamProvider = {
  name: 'toonstream',
  // MIRRORS already leads with PRIMARY, so this is the full rotation in order.
  sites: MIRRORS,
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const ep = opts.episode ?? 1;

      // Wrap entire provider in a hard 13s budget (leaves 2s margin under 15s timeout)
      const HARD_LIMIT = 13_000;
      const result = await Promise.race([
        _toonStreamSingle(opts, ep),
        new Promise<SourceResult[]>(resolve => setTimeout(() => resolve([]), HARD_LIMIT)),
      ]);
      return result;
    } catch {
      return [];
    }
  },
};

async function _toonStreamSingle(opts: SourceOptions, ep: number): Promise<SourceResult[]> {
  try {
    // Fast path: probe episode URLs directly using slugified titles
    const queries = buildSearchQueries(opts.titles).slice(0, 2);
    const directProbes: Promise<SourceResult[] | null>[] = [];

    for (const query of queries) {
      const slug = slugifyTitle(query);
      if (!slug) continue;
      for (const season of [1, 2]) {
        for (const epPath of [
          `/episode/${slug}-${season}x${ep}/`,
          `/episode/${slug}-ep-${ep}/`,
        ]) {
          directProbes.push(
            resolveEpisodeSources(epPath, `${PRIMARY}/series/${slug}/`).then(
              sources => sources.length > 0 ? sources : null
            )
          );
        }
      }
    }

    const directResults = await Promise.allSettled(directProbes);
    for (const r of directResults) {
      if (r.status === 'fulfilled' && r.value) return r.value;
    }

    // Fallback: full slug discovery + series page
    const series = await findSeriesSlug(opts.titles);
    if (!series) return [];

    const seriesPath = `/series/${series.slug}`;
    const seriesUrl = `${series.base}${seriesPath}`;

    // Try episode hrefs from series page
    const seriesPage = await fetchHtml(seriesPath);
    if (seriesPage) {
      for (const season of [1, 2, 3, 4]) {
        const epHref = findEpisodeHref(seriesPage.html, series.slug, season, ep);
        if (epHref) {
          const sources = await resolveEpisodeSources(epHref, seriesUrl);
          if (sources.length > 0) return sources;
          break;
        }
      }
    }

    // Probe episode paths in parallel
    const epPaths: string[] = [];
    for (const season of [1, 2, 3]) {
      epPaths.push(
        `/episode/${series.slug}-${season}x${ep}/`,
        `/episode/${series.slug}-ep-${ep}/`,
        `/episode/${series.slug}-${ep}/`,
      );
    }

    const settled = await Promise.allSettled(
      epPaths.map(p => resolveEpisodeSources(p, seriesUrl))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.length > 0) return r.value;
    }

    return [];
  } catch {
    return [];
  }
}

export default provider;
export { RUBYSTM_ORIGIN };
