/**
 * Quality normalisation utilities for Toko provider adapters.
 * Requirements: 3.4, 3.5, 3.6, 3.7
 */

export type Quality = '2160p' | '1080p' | '720p' | '480p' | '360p' | 'unknown';

const QUALITY_MAP: Record<string, Quality> = {
  '2160p': '2160p',
  '4k': '2160p',
  'uhd': '2160p',
  '1080p': '1080p',
  'fhd': '1080p',
  '720p': '720p',
  'hd': '720p',
  '480p': '480p',
  'sd': '480p',
  '360p': '360p',
};

/**
 * Normalises a raw quality string to one of the standardised quality labels.
 * Returns 'unknown' if the raw string cannot be mapped.
 *
 * @param raw - Provider-supplied quality string (e.g. "1080p", "HD", "4K").
 */
export function normalizeQuality(raw: string): Quality {
  if (!raw) return 'unknown';
  return QUALITY_MAP[raw.toLowerCase().trim()] ?? 'unknown';
}

/**
 * Detects whether a URL points to an HLS stream, MP4 file, or unknown type.
 *
 * @param url - The source URL to inspect.
 */
export function detectSourceType(url: string): 'hls' | 'mp4' | 'unknown' {
  if (!url) return 'unknown';
  if (url.endsWith('.m3u8') || url.includes('/hls/')) return 'hls';
  if (/\.(mp4|m4v|webm|mkv)$/i.test(url)) return 'mp4';
  return 'unknown';
}
