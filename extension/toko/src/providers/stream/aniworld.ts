/**
 * AniWorld — scraper adapter (https://aniworld.to)
 * Updated with logic from extension/A1/src/providers/aniworld
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';
import { fetchTextWithBypass } from '../../utils/common/fetch-bypass.js';
import { buildSearchQueries, slugifyTitle } from '../../utils/scraping/title-normalizer.js';

const BASE_URL = 'https://aniworld.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function normalizeLang(text: string): { name: string; code: string; isDub: boolean } {
  const l = text.toLowerCase();
  if (l.includes('deutsch') || l.includes('german')) return { name: 'German', code: 'de', isDub: true };
  if (l.includes('ger-sub') || l.includes('german sub')) return { name: 'German Sub', code: 'de-sub', isDub: false };
  if (l.includes('englisch') || l.includes('english')) return { name: 'English', code: 'en', isDub: true };
  if (l.includes('japanisch') || l.includes('japanese')) return { name: 'Japanese', code: 'ja', isDub: false };
  return { name: text || 'German', code: 'de', isDub: true };
}

async function search(query: string): Promise<Array<{ slug: string; title: string }>> {
  try {
    const cleanQuery = query.replace(/season\s+\d+/i, '').replace(/\bmovie\b/i, '').trim();

    // 1. AJAX search — aniworld.to blocks this with 403 from most IPs.
    // Use a short timeout so we fail fast rather than hanging.
    try {
      const ajaxRes = await fetchResponse(`${BASE_URL}/ajax/search`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE_URL}/search`,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: `keyword=${encodeURIComponent(cleanQuery)}`,
        timeoutMs: 4000,
      });
      if (ajaxRes.ok) {
        const text = await ajaxRes.text();
        const fb = text.indexOf('[');
        const lb = text.lastIndexOf(']');
        if (fb !== -1 && lb !== -1) {
          const json = JSON.parse(text.substring(fb, lb + 1));
          const items = (Array.isArray(json) ? json : []).map((item: any) => {
            const rawLink = item.link || '';
            const slug = rawLink.split('/stream/').pop()?.split('/')[0] || rawLink.split('/').pop() || '';
            return {
              title: item.title?.replace(/<[^>]*>?/gm, '') || '',
              slug,
            };
          }).filter(item => item.slug);
          if (items.length > 0) return items;
        }
      }
    } catch { /* AJAX blocked — fall through to direct slug */ }

    // 2. HTML search — also likely blocked. Skip it to avoid hanging on CF bypass.
    // Only attempt if we have a bypass session already (indicated by absence of 403 above).
    // For now, fall through to direct slug construction.
  } catch { /* ignore */ }

  // Fallback: construct slug directly from title — works when the show is listed
  const directSlug = slugifyTitle(query);
  if (directSlug) return [{ slug: directSlug, title: query }];
  return [];
}

async function extractStreamFromHoster(hosterUrl: string): Promise<string | null> {
  try {
    const origin = new URL(hosterUrl).origin;
    const html = await fetchTextWithBypass(hosterUrl, {
      headers: {
        Referer: BASE_URL,
        'User-Agent': UA,
      },
      timeoutMs: 6000,
    });
    if (!html) return null;

    const master = html.match(/["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i)
      || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (master) return master[1];

    const sourcesMatch = html.match(/sources\s*:\s*\[([\s\S]*?)\]/);
    if (sourcesMatch) {
      const file = sourcesMatch[1].match(/file\s*:\s*["']([^"']+)["']/);
      if (file?.[1]) return file[1];
    }

    const voeMatch = html.match(/(?:source|file|hls)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (voeMatch) return voeMatch[1];

    const doodMatch = html.match(/\/pass_md5\/[a-z0-9\/]+/i);
    if (doodMatch) return `${origin}${doodMatch[0]}`;

    return null;
  } catch {
    return null;
  }
}

async function followRedirect(redirectPath: string, pageUrl: string): Promise<string | null> {
  try {
    const fullUrl = redirectPath.startsWith('http') ? redirectPath : `${BASE_URL}${redirectPath}`;
    const res = await fetchResponse(fullUrl, {
      redirect: 'manual' as any,
      headers: { Referer: pageUrl, 'User-Agent': UA },
      timeoutMs: 4000,
    });
    const loc = res.headers.get('location') || (res as any).headers.get('Location');
    if (loc) return loc.startsWith('http') ? loc : `${BASE_URL}${loc}`;
    if ((res as any).url && (res as any).url !== fullUrl) return (res as any).url;
    return null;
  } catch {
    return null;
  }
}

const provider: StreamProvider = {
  name: 'aniworld',
  sites: [BASE_URL],
  async getLanguages() {
    return [
      { language: 'de', label: 'German Dub', type: 'audio' as const },
      { language: 'de-sub', label: 'German Sub', type: 'audio' as const },
      { language: 'en', label: 'English Dub', type: 'audio' as const },
      { language: 'ja', label: 'Japanese', type: 'audio' as const },
    ];
  },
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    // Aniworld is Cloudflare-protected — most requests fail fast with 403.
    // Wrap the whole thing in a 10s hard budget so retries don't blow the caller's 15s limit.
    const ANIWORLD_TIMEOUT = 9_500;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANIWORLD_TIMEOUT);

    try {
      const result = await _aniworldSingle(opts, controller.signal);
      return result;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  },
};

async function _aniworldSingle(opts: SourceOptions, signal: AbortSignal): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
  const titles = opts.titles || [];

      for (const titleQuery of buildSearchQueries(titles).slice(0, 2)) {
        if (signal.aborted) return [];
        const searchResults = await search(titleQuery);
        if (searchResults.length === 0) continue;

        for (const item of searchResults.slice(0, 2)) {
          if (signal.aborted) return [];
          const slug = item.slug;

          for (const staffel of ['staffel-1', 'staffel-2']) {
            if (signal.aborted) return [];
            const watchUrl = `${BASE_URL}/anime/stream/${slug}/${staffel}/episode-${targetEp}`;

            const html = await fetchTextWithBypass(watchUrl, {
              headers: { 'User-Agent': UA, Referer: `${BASE_URL}/` },
              timeoutMs: 6000,
            });

            if (!html) continue;
            const $ = loadHtml(html);

            const langMap: Record<string, { name: string; code: string; isDub: boolean }> = {};
            $.find('.changeLanguageBox img').each((_: number, img: any) => {
              const $img = $(img);
              const key = $img.attr('data-lang-key');
              const t = $img.attr('title') || $img.attr('alt') || '';
              if (key) langMap[key] = normalizeLang(t);
            });

            const candidates: Array<{ redirectUrl: string; langKey?: string; hoster: string }> = [];

            $.find('li[data-lang-key][data-link-target]').each((_: number, li: any) => {
              const $li = $(li);
              const langKey = $li.attr('data-lang-key');
              const redirectUrl = $li.attr('data-link-target');
              const hoster = $li.attr('data-hoster-name') || 'Unknown';
              if (redirectUrl) candidates.push({ redirectUrl, langKey, hoster });
            });

            if (candidates.length === 0) {
              $.find("a[href*='/redirect/']").each((_: number, link: any) => {
                const redirectUrl = $(link).attr('href');
                if (redirectUrl) candidates.push({ redirectUrl, hoster: 'Hoster' });
              });
            }

            if (candidates.length === 0) continue;

            const settled = await Promise.allSettled(
              candidates.slice(0, 3).map(async (cand) => {
                if (signal.aborted) return null;
                const hosterUrl = await followRedirect(cand.redirectUrl, watchUrl);
                if (!hosterUrl) return null;
                const stream = await extractStreamFromHoster(hosterUrl);
                if (!stream) return null;
                const lang = cand.langKey && langMap[cand.langKey] ? langMap[cand.langKey] : { name: 'German', code: 'de', isDub: true };
                return {
                  source: 'aniworld',
                  url: stream,
                  quality: normalizeQuality('HD'),
                  headers: { Referer: hosterUrl, 'User-Agent': UA },
                  subtitles: [],
                  audioLanguage: lang.code,
                  language: lang.name,
                  sourceType: detectSourceType(stream),
                } satisfies SourceResult;
              })
            );

            const results: SourceResult[] = [];
            for (const r of settled) {
              if (r.status === 'fulfilled' && r.value) results.push(r.value);
            }
            if (results.length > 0) return results;
          }
        }
      }
      return [];
    } catch {
      return [];
    }
}

export default provider;
