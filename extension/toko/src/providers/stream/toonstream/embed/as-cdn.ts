import { fetchResponse } from '../../../../utils/http/fetch.js';
import type { SourceResult } from '../../../../types.js';
import { normalizeQuality } from '../../../../utils/scraping/quality.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export async function resolveAsCdnSource(videoUrl: string, referer: string): Promise<SourceResult | null> {
  try {
    const origin = new URL(videoUrl).origin;
    const res1 = await fetchResponse(videoUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': UA, Referer: referer },
      timeoutMs: 10000,
    });
    if (!res1.ok) return null;

    const rawCookie = res1.headers.get('set-cookie') ?? '';
    const cookieStr = rawCookie.split(';')[0]?.trim();
    if (!cookieStr) return null;

    const hash = videoUrl.split('/').filter(Boolean).pop();
    if (!hash) return null;

    const apiUrl = `${origin}/player/index.php?data=${hash}&do=getVideo`;
    const res2 = await fetchResponse(apiUrl, {
      method: 'POST',
      headers: {
        Cookie: cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: origin,
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer,
      },
      body: JSON.stringify({ hash, r: '' }),
      timeoutMs: 10000,
    });
    if (!res2.ok) return null;

    const data = await res2.json() as { hls?: boolean; videoSource?: string; securedLink?: string };
    const streamUrl = (data.securedLink || data.videoSource || '').replace(/\\\//g, '/');
    if (!streamUrl) return null;

    return {
      source: 'toonstream',
      url: streamUrl,
      quality: normalizeQuality('HD'),
      headers: { Cookie: cookieStr, 'User-Agent': UA, Referer: referer },
      subtitles: [],
      audioLanguage: 'en',
      language: 'English',
      sourceType: data.hls || streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
    };
  } catch {
    return null;
  }
}
