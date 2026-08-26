/**
 * Animeya — dual provider implementation
 * Site: https://animeya.cc
 * 
 * Provider 1 (VidNest): Direct embed using anilistId
 *   URL: https://vidnest.fun/animepahe/{anilistId}/{episode}/sub
 * 
 * Provider 2 (mp4upload): Scrape from watch page
 *   URL: https://animeya.cc/watch/{anime-name}-{anilistId}
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types/index.js';

import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASE_URL = 'https://animeya.cc';
const VIDNEST_BASE = 'https://vidnest.fun/animepahe';

const HEADERS = {
  Referer: `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

/**
 * Provider 1: VidNest direct embed (fastest, uses anilistId).
 * Works for any valid positive anilistId.
 */
async function tryVidNestDirect(anilistId: number, episode: number): Promise<SourceResult[]> {
  try {
    // Try sub then dub variants
    const variants: Array<{ suffix: string; audioLanguage: string; language: string }> = [
      { suffix: 'sub', audioLanguage: 'ja', language: 'Japanese' },
      { suffix: 'dub', audioLanguage: 'en', language: 'English Dub' },
    ];

    const results: SourceResult[] = [];

    for (const variant of variants) {
      const embedUrl = `${VIDNEST_BASE}/${anilistId}/${episode}/${variant.suffix}`;
      const res = await fetchResponse(embedUrl, {
        headers: { ...HEADERS, Referer: `${BASE_URL}/` },
        signal: AbortSignal.timeout(3000),
      } as RequestInit);

      if (!res.ok) continue;

      const html = await res.text();

      // Extract sources from VidNest embed
      const sourcesMatch = html.match(/sources\s*:\s*\[([^\]]+)\]/);
      if (sourcesMatch) {
        const sourcesStr = sourcesMatch[1];
        const fileMatch = sourcesStr.match(/file\s*:\s*["']([^"']+)["']/);

        if (fileMatch) {
          const url = fileMatch[1];
          const subtitles: SubtitleTrack[] = [];

          // Extract subtitles if present
          const tracksMatch = html.match(/tracks\s*:\s*\[([^\]]+)\]/);
          if (tracksMatch) {
            const trackRegex = /\{[^}]*file\s*:\s*["']([^"']+)["'][^}]*label\s*:\s*["']([^"']+)["'][^}]*\}/g;
            let trackMatch;
            while ((trackMatch = trackRegex.exec(tracksMatch[1])) !== null) {
              subtitles.push({
                url: trackMatch[1],
                label: trackMatch[2],
                language: trackMatch[2],
                default: false,
              });
            }
          }

          results.push({
            source: `animeya-vidnest-${variant.suffix}`,
            url,
            quality: normalizeQuality(''),
            headers: { Referer: embedUrl },
            subtitles,
            audioLanguage: variant.audioLanguage,
            language: variant.language,
            sourceType: url.includes('.m3u8') ? 'hls' as const : 'mp4' as const,
          });
          continue;
        }
      }

      // Fallback: Look for direct video URLs in script tags or Next.js payload
      const m3u8Match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/);
      if (m3u8Match) {
        results.push({
          source: `animeya-vidnest-${variant.suffix}`,
          url: m3u8Match[1],
          quality: normalizeQuality(''),
          headers: { Referer: embedUrl },
          subtitles: [],
          audioLanguage: variant.audioLanguage,
          language: variant.language,
          sourceType: 'hls' as const,
        });
        continue;
      }

      const mp4Match = html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/);
      if (mp4Match) {
        results.push({
          source: `animeya-vidnest-${variant.suffix}`,
          url: mp4Match[1],
          quality: normalizeQuality(''),
          headers: { Referer: embedUrl },
          subtitles: [],
          audioLanguage: variant.audioLanguage,
          language: variant.language,
          sourceType: 'mp4' as const,
        });
        continue;
      }

      // If VidNest itself is an embed container, emit the embed URL
      results.push({
        source: `animeya-vidnest-${variant.suffix}`,
        url: embedUrl,
        quality: normalizeQuality(''),
        headers: { Referer: `${BASE_URL}/` },
        subtitles: [],
        audioLanguage: variant.audioLanguage,
        language: variant.language,
        sourceType: 'custom' as const,
      });
    }

    return results;
  } catch (err) {
    console.error('[Animeya.VidNest] Error:', err);
  }
  return [];
}

/**
 * Provider 2: mp4upload scraping (requires search to get anime name)
 */
async function tryMp4UploadScrape(titles: string[], anilistId: number | undefined, episode: number): Promise<SourceResult[]> {
  try {
    // If we have anilistId, try direct watch URL construction
    if (anilistId && anilistId > 0) {
      // Try to construct anime name from titles
      const animeName = titles[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? '';
      if (animeName) {
        const watchUrl = `${BASE_URL}/watch/${animeName}-${anilistId}`;
        const sources = await extractMp4UploadSources(watchUrl, episode);
        if (sources.length > 0) return sources;
      }
    }

    return [];
  } catch (err) {
    console.error('[Animeya.mp4upload] Error:', err);
  }
  return [];
}

async function extractMp4UploadSources(watchUrl: string, episode: number): Promise<SourceResult[]> {
  try {
    const epUrl = `${watchUrl}?ep=${episode}`;
    const res = await fetchResponse(epUrl, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = loadHtml(html);

    const sources: SourceResult[] = [];

    // Check for embedded mp4upload iframes
    $.find('iframe[src*="mp4upload"], iframe[src*="vidnest"]').each((_: number, el: any) => {
      const src: string = el.attr?.('src') ?? '';
      if (src && !sources.length) {
        sources.push({
          source: 'animeya-mp4upload',
          url: src,
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          audioLanguage: 'ja',
          language: 'Japanese',
          sourceType: 'custom',
        });
      }
    });

    if (sources.length > 0) return sources;

    // Fallback: Direct video URL extraction from script tags
    $.find('script').each((_: number, el: any) => {
      const text: string = el.text?.() ?? '';
      const m3u8Match = text.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/);
      if (m3u8Match && !sources.length) {
        sources.push({
          source: 'animeya-mp4upload',
          url: m3u8Match[1],
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          audioLanguage: 'ja',
          language: 'Japanese',
          sourceType: 'hls' as const,
        });
      }
      const mp4Match = text.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/);
      if (mp4Match && !sources.length) {
        sources.push({
          source: 'animeya-mp4upload',
          url: mp4Match[1],
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          audioLanguage: 'ja',
          language: 'Japanese',
          sourceType: 'mp4' as const,
        });
      }
    });

    return sources;
  } catch (err) {
    console.error('[Animeya.mp4upload.extract] Error:', err);
  }
  return [];
}

const provider: StreamProvider = {
  name: 'animeya',
  sites: [BASE_URL, VIDNEST_BASE],
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const anilistId = opts.anilistId;

      // Try Provider 1 (VidNest) first — works when anilistId is a valid positive integer
      if (anilistId && anilistId > 0) {
        const vidnestSources = await tryVidNestDirect(anilistId, targetEp);
        if (vidnestSources.length > 0) {
          return vidnestSources;
        }
      }

      // Fallback to Provider 2 (mp4upload scraping)
      const titles = opts.titles ?? [];
      if (titles.length > 0) {
        const mp4uploadSources = await tryMp4UploadScrape(titles, anilistId, targetEp);
        if (mp4uploadSources.length > 0) {
          return mp4uploadSources;
        }
      }

      return [];
    } catch (err) {
      console.error('[Animeya] Error:', err);
      return [];
    }
  },
};

export default provider;
