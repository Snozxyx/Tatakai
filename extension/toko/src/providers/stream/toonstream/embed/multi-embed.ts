/**
 * Multi-embed resolver for ToonStream (and any site that uses these players).
 *
 * Scrapers are based on live probing of each host. Each resolver returns a
 * SourceResult on success or null when extraction fails (caller falls back to
 * returning the embed URL as a custom source).
 *
 * Supported hosts (with extraction method):
 *   emturbovid.com   – `var urlPlay = '…'` inline JS → direct m3u8
 *   blakiteapi.xyz   – /api/get.php → dataId + qid → rumble CDN mp4/m3u8
 *   vidmoly.net      – m3u8 URL exposed literally in page HTML
 *   strmup.to        – JS-challenge gate, no static extraction → embed fallback
 *   abyssplayer.com  – binary-encrypted media field → embed fallback
 *   cloudy.upns.one  – Vue SPA, JS-only → embed fallback
 *   gdmirrorbot.nl   – obfuscated POST API → embed fallback
 */

import { fetchResponse, loadHtml } from '../../../../utils/http/fetch.js';
import type { SourceResult } from '../../../../types.js';
import { normalizeQuality } from '../../../../utils/scraping/quality.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getText(
  url: string,
  referer: string,
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetchResponse(url, {
      headers: { 'User-Agent': UA, Referer: referer, ...extraHeaders },
      timeoutMs: 5000,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Detect the audio/dub language from an embed URL or its page-title/server-name.
 * ToonStream is heavily Hindi-dubbed, so unknown tracks default to Hindi, not English.
 */
export function detectEmbedLanguage(
  embedUrl: string,
  titleHint?: string,
): { audioLanguage: string; language: string } {
  const hay = `${embedUrl} ${titleHint ?? ''}`.toLowerCase();
  if (/\bhind\b|hindi/.test(hay)) return { audioLanguage: 'hi', language: 'Hindi Dub' };
  if (/\btel\b|telugu/.test(hay)) return { audioLanguage: 'te', language: 'Telugu Dub' };
  if (/\btam\b|tamil/.test(hay)) return { audioLanguage: 'ta', language: 'Tamil Dub' };
  if (/\bmal\b|malayalam/.test(hay)) return { audioLanguage: 'ml', language: 'Malayalam Dub' };
  if (/\barab\b|arabic/.test(hay)) return { audioLanguage: 'ar', language: 'Arabic Dub' };
  if (/\bger\b|german|deutsch/.test(hay)) return { audioLanguage: 'de', language: 'German Dub' };
  if (/\bfre\b|french|français/.test(hay)) return { audioLanguage: 'fr', language: 'French Dub' };
  if (/\bjap\b|japan/.test(hay)) return { audioLanguage: 'ja', language: 'Japanese' };
  // Multi-audio: detected from title hints like "Multi Audio", "Multi-Audio", "Dual Audio"
  if (/multi.?audio|dual.?audio|multi.?dub/i.test(hay)) return { audioLanguage: 'hi', language: 'Multi Audio' };
  // English: only match when explicitly stated AND not from a pure Hindi/South-Asian context
  if (/\beng\b|english/.test(hay)) return { audioLanguage: 'en', language: 'English' };
  // Default: ToonStream's dominant dub language is Hindi
  return { audioLanguage: 'hi', language: 'Hindi Dub' };
}

// ── emturbovid.com ────────────────────────────────────────────────────────────
// New architecture (2025+): `urlPlay` is loaded from an external script at
// https://ver1.sptvp.com/play/{userID}/player.js
// The page exposes `var userID` and the title via JS vars.
// Fallback: data-hash on #video_player, or any m3u8 in page HTML.

async function resolveEmturbovid(url: string): Promise<SourceResult | null> {
  const html = await getText(url, 'https://toonstream.one/');
  if (!html) return null;

  const origin = new URL(url).origin;

  // Strategy 1: `var urlPlay = '...'` directly in page
  const urlPlayMatch = html.match(/var\s+urlPlay\s*=\s*['"]([^'"]+)['"]/);
  if (urlPlayMatch?.[1]) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const lang = detectEmbedLanguage(url, titleMatch?.[1] ?? '');
    return {
      source: 'toonstream-emturbovid',
      url: urlPlayMatch[1],
      quality: normalizeQuality('1080p'),
      headers: { Referer: url, Origin: origin, 'User-Agent': UA },
      subtitles: [],
      ...lang,
      sourceType: 'hls',
    };
  }

  // Strategy 2: fetch the external player.js that contains urlPlay
  const userIdMatch = html.match(/var\s+userID\s*=\s*['"]?(\d+)['"]?/);
  const videoIdMatch = html.match(/var\s+videoID\s*=\s*['"]?([A-Za-z0-9_-]+)['"]?/);
  if (userIdMatch?.[1] && videoIdMatch?.[1]) {
    const playerJsUrl = `https://ver1.sptvp.com/play/${userIdMatch[1]}/player.js?id=${videoIdMatch[1]}`;
    const playerJs = await getText(playerJsUrl, url);
    if (playerJs) {
      const m3u8InJs = playerJs.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (m3u8InJs) {
        const titleMatch = html.match(/var\s+title\s*=\s*["']([^"']+)["']/);
        const lang = detectEmbedLanguage(url, titleMatch?.[1] ?? '');
        return {
          source: 'toonstream-emturbovid',
          url: m3u8InJs[0],
          quality: normalizeQuality('1080p'),
          headers: { Referer: url, Origin: origin, 'User-Agent': UA },
          subtitles: [],
          ...lang,
          sourceType: 'hls',
        };
      }
    }
  }

  // Strategy 3: data-hash attribute on #video_player
  const dataHashMatch = html.match(/data-hash=["']([^"']+\.m3u8[^"']*)["']/i);
  // Strategy 4: any m3u8 URL anywhere in page
  const rawM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);

  const src = dataHashMatch?.[1] ?? rawM3u8?.[0];
  if (!src) return null;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const lang = detectEmbedLanguage(url, titleMatch?.[1] ?? '');

  return {
    source: 'toonstream-emturbovid',
    url: src,
    quality: normalizeQuality('1080p'),
    headers: { Referer: url, Origin: origin, 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'hls',
  };
}

// ── blakiteapi.xyz ────────────────────────────────────────────────────────────
// Probe result:
//   GET /api/get.php?id={season}-{episode}&tmdbId={tmdbId}
//   → { success, data: { dataId, qid, quality, format, ranges } }
//   Stream: https://hugh.cdn.rumble.cloud/video/{dataId}.{code}.mp4
//   Quality codes: oaa=240p, baa=360p, caa=480p, gaa=720p, haa=1080p
//   (from /watch/player.js: qualityCodes = ['oaa','baa','caa','gaa','haa'])

const BLAKITE_QUALITY_CODES: Record<string, string> = {
  '240p': 'oaa',
  '360p': 'baa',
  '480p': 'caa',
  '720p': 'gaa',
  '1080p': 'haa',
};
const BLAKITE_CDN = 'https://hugh.cdn.rumble.cloud/video/';

async function resolveBlakiteapi(url: string): Promise<SourceResult | null> {
  // URL pattern: /embed/{tmdbId}/{season}-{episode}
  const m = url.match(/\/embed\/(\d+)\/([\d]+-[\d]+)/);
  if (!m) return null;

  const [, tmdbId, uniqueId] = m;
  const apiUrl = `https://blakiteapi.xyz/api/get.php?id=${encodeURIComponent(uniqueId)}&tmdbId=${encodeURIComponent(tmdbId)}`;

  const rawJson = await getText(apiUrl, url, { Accept: 'application/json' });
  if (!rawJson) return null;

  let data: {
    success?: boolean;
    data?: {
      dataId?: string;
      qid?: number;
      quality?: string;
      format?: string;
      ranges?: string;
      language?: string;
      animeTitle?: string;
    };
  };
  try {
    data = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const d = data?.data;
  if (!data?.success || !d?.dataId) return null;

  // Determine best quality to use — prefer 720p for MP4
  const fmt = (d.format ?? 'MP4').toUpperCase();
  const targetQuality = d.quality ?? '720p';
  const code = BLAKITE_QUALITY_CODES[targetQuality] ?? BLAKITE_QUALITY_CODES['480p'];

  let streamUrl: string;
  if (fmt === 'M3U8' && d.ranges) {
    // HLS with byte-ranges — pick highest quality range if available
    streamUrl = `${BLAKITE_CDN}${d.dataId}.${code}.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl`;
  } else {
    // MP4
    streamUrl = `${BLAKITE_CDN}${d.dataId}.${code}.mp4`;
  }

  // Language detection: API returns "ORG" for multi-audio, otherwise Hindi etc.
  const apiLang = (d.language ?? '').toUpperCase();
  let audioLanguage = 'hi';
  let language = 'Hindi Dub';
  if (apiLang === 'ENG' || apiLang === 'EN') { audioLanguage = 'en'; language = 'English'; }
  else if (apiLang === 'ORG' || apiLang === 'MULTI') { audioLanguage = 'hi'; language = 'Multi Audio'; }
  else if (apiLang === 'DUB') { audioLanguage = 'hi'; language = 'Hindi Dub'; }
  // override with title hint if present
  const titleLang = detectEmbedLanguage(url, d.animeTitle ?? '');
  if (titleLang.audioLanguage !== 'hi' || language === 'Hindi Dub') {
    audioLanguage = titleLang.audioLanguage;
    language = titleLang.language;
  }

  // Build quality list for multi-quality sources
  const sources: SourceResult[] = [];
  const qualities = fmt === 'M3U8' && d.ranges
    ? parseRangeQualities(d.ranges)
    : buildQidQualities(d.qid ?? 1);

  for (const q of qualities) {
    const qCode = BLAKITE_QUALITY_CODES[q.label];
    if (!qCode) continue;
    let qUrl: string;
    if (fmt === 'M3U8' && q.range) {
      qUrl = `${BLAKITE_CDN}${d.dataId}.${qCode}.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=${q.range}`;
    } else {
      qUrl = `${BLAKITE_CDN}${d.dataId}.${qCode}.mp4`;
    }
    sources.push({
      source: `toonstream-blakiteapi-${q.label}`,
      url: qUrl,
      quality: normalizeQuality(q.label),
      headers: { Referer: url, 'User-Agent': UA, Origin: 'https://blakiteapi.xyz' },
      subtitles: [],
      audioLanguage,
      language,
      sourceType: fmt === 'M3U8' ? 'hls' : 'mp4',
    });
  }

  // Return best quality (720p preferred), fall back to primary
  const best = sources.find(s => s.source.includes('720p'))
    ?? sources.find(s => s.source.includes('480p'))
    ?? sources[sources.length - 1];

  return best ?? {
    source: 'toonstream-blakiteapi',
    url: streamUrl,
    quality: normalizeQuality(targetQuality),
    headers: { Referer: url, 'User-Agent': UA, Origin: 'https://blakiteapi.xyz' },
    subtitles: [],
    audioLanguage,
    language,
    sourceType: fmt === 'M3U8' ? 'hls' : 'mp4',
  };
}

function parseRangeQualities(ranges: string): Array<{ label: string; range: string | null }> {
  const out: Array<{ label: string; range: string | null }> = [];
  for (const line of ranges.split('\n')) {
    const m = line.trim().match(/^(\d+-\d+)\s*\(([^)]+)\)/);
    if (m) out.push({ label: m[2].trim(), range: m[1] });
  }
  return out;
}

const BLAKITE_QUALITY_LABELS = ['240p', '360p', '480p', '720p', '1080p'];
function buildQidQualities(qid: number): Array<{ label: string; range: null }> {
  const max = Math.min(qid, BLAKITE_QUALITY_LABELS.length);
  return BLAKITE_QUALITY_LABELS.slice(0, max).map(label => ({ label, range: null }));
}

// ── vidmoly.net ───────────────────────────────────────────────────────────────
// Probe result: m3u8 URL is literally present in page HTML inside a JWPlayer
// setup block, e.g.:
//   https://box-1437-w10.vmeas.cloud/hls2/…/master.m3u8?t=…&s=…&e=…

async function resolveVidmoly(url: string): Promise<SourceResult | null> {
  // Derive the embed URL (handles both /embed-{code}.html and bare /{code} forms)
  const embedUrl = url.includes('/embed-') ? url : url.replace(/\/([A-Za-z0-9]+)$/, '/embed-$1.html');
  const html = await getText(embedUrl, 'https://toonstream.one/');
  if (!html) return null;

  // Strategy 1: JWPlayer sources array — sources: [{ file: '...' }]
  // Handles split lines by collapsing whitespace first
  const collapsed = html.replace(/\s+/g, ' ');
  const sourcesObjMatch = collapsed.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/i);
  if (sourcesObjMatch?.[1]) {
    const src = sourcesObjMatch[1];
    const lang = detectEmbedLanguage(url);
    // Extract subtitle tracks from baseTracks / tracks arrays
    const subtitles: Array<{ url: string; label: string; language: string; default?: boolean }> = [];
    const tracksMatch = collapsed.match(/tracks\s*=\s*\[([^\]]+)\]/);
    if (tracksMatch) {
      const trackRegex = /file\s*:\s*['"]([^'"]+)['"]\s*,\s*(?:label|kind)\s*:\s*['"]([^'"]+)['"]/g;
      let tm: RegExpExecArray | null;
      while ((tm = trackRegex.exec(tracksMatch[1])) !== null) {
        if (!tm[1].includes('.vtt') && !tm[1].includes('.srt')) continue;
        subtitles.push({ url: tm[1], label: tm[2], language: tm[2] });
      }
    }
    return {
      source: 'toonstream-vidmoly',
      url: src,
      quality: normalizeQuality('HD'),
      headers: { Referer: embedUrl, Origin: 'https://vidmoly.net', 'User-Agent': UA },
      subtitles,
      ...lang,
      sourceType: 'hls',
    };
  }

  // Strategy 2: plain m3u8 URL anywhere in page
  const m3u8 = html.match(/https?:\/\/[^\s"'<>]+(?:master|chunklist|playlist|index)\.m3u8[^\s"'<>]*/i)
    ?? html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  if (!m3u8) return null;

  const lang = detectEmbedLanguage(url);
  return {
    source: 'toonstream-vidmoly',
    url: m3u8[0],
    quality: normalizeQuality('HD'),
    headers: {
      Referer: embedUrl,
      Origin: 'https://vidmoly.net',
      'User-Agent': UA,
    },
    subtitles: [],
    ...lang,
    sourceType: 'hls',
  };
}

// ── strmup.to ─────────────────────────────────────────────────────────────────
// Probe result: JS-challenge redirect (JWT bot check) → GDPR/ad consent wall.
// No static HTML extraction possible. Return embed as custom fallback.

async function resolveStrmup(url: string): Promise<SourceResult | null> {
  // strmup requires a JS engine to pass the JWT bot check.
  // Best we can do without a browser: return as custom embed for the player.
  const lang = detectEmbedLanguage(url);
  return {
    source: 'toonstream-strmup',
    url,
    quality: normalizeQuality('HD'),
    headers: { Referer: 'https://toonstream.one/', 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'custom',
  };
}

// ── abyssplayer.com ───────────────────────────────────────────────────────────
// Probe result: `const datas = "…"` → base64 → JSON with binary-encrypted
// `media` field. The `initializePlayer` function from iamcdn.net is required
// to decrypt it. No static extraction is possible without running the JS.
// Return as custom embed fallback so the in-app WebView can play it.

async function resolveAbyssplayer(url: string): Promise<SourceResult | null> {
  const lang = detectEmbedLanguage(url);
  return {
    source: 'toonstream-abyssplayer',
    url,
    quality: normalizeQuality('HD'),
    headers: { Referer: 'https://toonstream.one/', 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'custom',
  };
}

// ── cloudy.upns.one ───────────────────────────────────────────────────────────
// Probe result: Vue SPA — HTML shell only, all content loaded via JS modules.
// No API endpoint exposed in HTML. Return as custom embed fallback.

async function resolveCloudy(url: string): Promise<SourceResult | null> {
  const lang = detectEmbedLanguage(url);
  return {
    source: 'toonstream-cloudy',
    url,
    quality: normalizeQuality('HD'),
    headers: { Referer: 'https://toonstream.one/', 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'custom',
  };
}

// ── gdmirrorbot.nl ────────────────────────────────────────────────────────────
// Probe result: obfuscated JS (hex-string-array cipher), POST to
// /embeds/check_st_strm.php with the fid+view_token — but view_token is
// session-bound and expires. The JS selects from site-specific embed players
// (abyss, strmup, upnshare, …) dynamically. Return as custom embed fallback.

async function resolveGdmirrorbot(url: string): Promise<SourceResult | null> {
  // Try to fetch the page to get an iframe redirect if present
  const html = await getText(url, 'https://toonstream.one/');
  if (html) {
    // gdmirrorbot sometimes inlines an iframe src after the JS resolves,
    // but in static HTML it is always empty. Check anyway.
    const $ = loadHtml(html);
    const iframeSrc =
      $('iframe#vidFrame').attr('src') ??
      $('iframe[src]').first().attr('src');
    if (iframeSrc && /^https?:\/\//.test(iframeSrc) && !iframeSrc.includes('gdmirrorbot')) {
      // Got a real inner player — recurse once into it
      const inner = await resolveMultiEmbed(iframeSrc, url);
      if (inner) return { ...inner, source: 'toonstream-gdmirrorbot' };
    }
  }

  const lang = detectEmbedLanguage(url);
  return {
    source: 'toonstream-gdmirrorbot',
    url,
    quality: normalizeQuality('HD'),
    headers: { Referer: 'https://toonstream.one/', 'User-Agent': UA },
    subtitles: [],
    ...lang,
    sourceType: 'custom',
  };
}

// ── Public dispatcher ─────────────────────────────────────────────────────────

/**
 * Attempt to resolve a known embed URL to a direct or embed SourceResult.
 *
 * Always returns a SourceResult (never null) so callers can include it
 * as a fallback embed source even when full extraction isn't possible.
 * Returns null only when the URL is completely malformed/unknown.
 */
export async function resolveMultiEmbed(
  embedUrl: string,
  _referer: string,
): Promise<SourceResult | null> {
  let host: string;
  try {
    host = new URL(embedUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

  if (host.includes('emturbovid.com') || host.includes('turboviplay.com')) {
    return resolveEmturbovid(embedUrl);
  }
  if (host.includes('blakiteapi.xyz')) {
    return resolveBlakiteapi(embedUrl);
  }
  if (host.includes('vidmoly.net') || host.includes('vidmoly.me')) {
    return resolveVidmoly(embedUrl);
  }
  if (host.includes('strmup.to')) {
    return resolveStrmup(embedUrl);
  }
  if (host.includes('abyssplayer.com') || host.includes('abyss.to')) {
    return resolveAbyssplayer(embedUrl);
  }
  if (host.includes('upns.one') || host.includes('cloudy.')) {
    return resolveCloudy(embedUrl);
  }
  if (host.includes('gdmirrorbot.nl')) {
    return resolveGdmirrorbot(embedUrl);
  }

  return null;
}
