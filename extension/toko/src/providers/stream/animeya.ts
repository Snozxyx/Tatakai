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
import { normalizeQuality } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE_URL = 'https://animeya.cc';
const VIDNEST_BASE = 'https://vidnest.fun/animepahe';

const HEADERS = {
  Referer: `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

/**
 * Provider 1: VidNest direct embed (fastest, uses anilistId)
 */
async function tryVidNestDirect(anilistId: number, episode: number): Promise<SourceResult[]> {
  try {
    // Try both sub and dub variants
    const variants = ['sub', 'dub'];
    
    for (const variant of variants) {
      const embedUrl = `${VIDNEST_BASE}/${anilistId}/${episode}/${variant}`;
      console.log('[Animeya.VidNest] Trying:', embedUrl);
      const res = await __tatakai_fetch__(embedUrl, {
        headers: { ...HEADERS, Referer: `${BASE_URL}/` },
      });
      
      console.log('[Animeya.VidNest] Response status:', res.status);
      
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
          
          return [{
            source: 'animeya-vidnest',
            url,
            quality: normalizeQuality(''),
            headers: { Referer: embedUrl },
            subtitles,
            sourceType: url.includes('.m3u8') ? 'hls' as const : 'mp4' as const,
          }];
        }
      }
      
      // Fallback: Look for direct video URLs in script tags
      const m3u8Match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
      if (m3u8Match) {
        return [{
          source: 'animeya-vidnest',
          url: m3u8Match[1],
          quality: normalizeQuality(''),
          headers: { Referer: embedUrl },
          subtitles: [],
          sourceType: 'hls' as const,
        }];
      }
      
      const mp4Match = html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
      if (mp4Match) {
        return [{
          source: 'animeya-vidnest',
          url: mp4Match[1],
          quality: normalizeQuality(''),
          headers: { Referer: embedUrl },
          subtitles: [],
          sourceType: 'mp4' as const,
        }];
      }
    }
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
    if (anilistId) {
      // Try to construct anime name from titles
      const animeName = titles[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? '';
      if (animeName) {
        const watchUrl = `${BASE_URL}/watch/${animeName}-${anilistId}`;
        console.log('[Animeya.mp4upload] Trying direct watch URL:', watchUrl);
        const sources = await extractMp4UploadSources(watchUrl, episode);
        if (sources.length > 0) return sources;
      }
    }
    
    console.log('[Animeya.mp4upload] Direct watch URL failed, no search available');
    return [];
  } catch (err) {
    console.error('[Animeya.mp4upload] Error:', err);
  }
  return [];
}

async function extractMp4UploadSources(watchUrl: string, episode: number): Promise<SourceResult[]> {
  try {
    // Construct episode URL
    const epUrl = `${watchUrl}?ep=${episode}`;
    
    console.log('[Animeya.mp4upload] Fetching episode page:', epUrl);
    const res = await __tatakai_fetch__(epUrl, { headers: HEADERS });
    if (!res.ok) {
      console.log('[Animeya.mp4upload] Episode page returned', res.status);
      return [];
    }
    
    const html = await res.text();
    console.log('[Animeya.mp4upload] HTML length:', html.length);
    const $ = __tatakai_parse_html__(html);
    
    // Look for mp4upload iframes or video sources
    const sources: SourceResult[] = [];
    
    // Check for embedded mp4upload iframes
    $.find('iframe[src*="mp4upload"], iframe[src*="vidnest"]').each((_: number, el: any) => {
      const src: string = el.attr?.('src') ?? '';
      console.log('[Animeya.mp4upload] Found iframe:', src);
      if (src && !sources.length) {
        // For mp4upload, we'd need to resolve the iframe
        // For now, return as embed URL that needs resolution
        sources.push({
          source: 'animeya-mp4upload',
          url: src,
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          sourceType: 'embed' as any, // Will need resolution
        });
      }
    });
    
    if (sources.length > 0) {
      console.log('[Animeya.mp4upload] Found', sources.length, 'iframe sources');
      return sources;
    }
    
    // Fallback: Direct video URL extraction from script tags
    $.find('script').each((_: number, el: any) => {
      const text: string = el.text?.() ?? '';
      const m3u8Match = text.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
      if (m3u8Match && !sources.length) {
        console.log('[Animeya.mp4upload] Found m3u8 in script:', m3u8Match[1]);
        sources.push({
          source: 'animeya-mp4upload',
          url: m3u8Match[1],
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          sourceType: 'hls' as const,
        });
      }
      const mp4Match = text.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
      if (mp4Match && !sources.length) {
        console.log('[Animeya.mp4upload] Found mp4 in script:', mp4Match[1]);
        sources.push({
          source: 'animeya-mp4upload',
          url: mp4Match[1],
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          sourceType: 'mp4' as const,
        });
      }
    });
    
    console.log('[Animeya.mp4upload] Total sources found:', sources.length);
    return sources;
  } catch (err) {
    console.error('[Animeya.mp4upload.extract] Error:', err);
  }
  return [];
}

const provider: StreamProvider = {
  name: 'animeya',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const anilistId = opts.anilistId;
      
      console.log('[Animeya] Starting with anilistId:', anilistId, 'episode:', targetEp);
      
      // Try Provider 1 (VidNest) first if we have anilistId - it's faster
      if (anilistId) {
        console.log('[Animeya] Trying VidNest direct embed...');
        const vidnestSources = await tryVidNestDirect(anilistId, targetEp);
        if (vidnestSources.length > 0) {
          console.log('[Animeya] ✅ VidNest returned', vidnestSources.length, 'sources');
          return vidnestSources;
        }
        console.log('[Animeya] VidNest failed, falling back to mp4upload scraping');
      }
      
      // Fallback to Provider 2 (mp4upload scraping)
      console.log('[Animeya] Trying mp4upload scraping...');
      const mp4uploadSources = await tryMp4UploadScrape(opts.titles, anilistId, targetEp);
      if (mp4uploadSources.length > 0) {
        console.log('[Animeya] ✅ mp4upload returned', mp4uploadSources.length, 'sources');
        return mp4uploadSources;
      }
      
      console.log('[Animeya] Both providers failed');
      return [];
    } catch (err) {
      console.error('[Animeya] Error:', err);
      return [];
    }
  },
};

export default provider;
