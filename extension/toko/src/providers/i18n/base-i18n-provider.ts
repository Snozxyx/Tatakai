/**
 * Shared scaffolding for multilingual (dub) Toko providers.
 *
 * Each i18n provider declares which BCP 47 language codes it serves and
 * implements `resolveEpisode()` to return one or more RawDubSource records.
 * The base class:
 *   - normalizes every result to a `SourceResult` with `audioLanguage` set,
 *   - categorizes servers by their language tag,
 *   - exposes `getLanguages()` for the Tatakai language-resolution engine,
 *   - de-duplicates URLs and prefers direct HLS over embeds.
 */
// Worker sandbox globals (declared in index.ts; redeclared so i18n files compile standalone).

import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types.js';
import { detectSourceType } from '../../utils/quality.js';
import { toAudioLanguageCode, type DubLanguage, DUB_LANGUAGES } from './dub-languages.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';
export interface RawDubSource {
  /** Direct m3u8/mp4 URL or an embed URL. */
  url: string;
  /** Human-readable server name (e.g. "Blkom", "VOE"). */
  server: string;
  /** BCP 47 code, e.g. "ar", "fr". Falls back to the provider default. */
  language?: string;
  /** Optional quality label ("1080p", "720p", "auto"). */
  quality?: string;
  /** Subtitle tracks for this source, if known. */
  subtitles?: SubtitleTrack[];
  /** Required HTTP headers (Referer/Origin/User-Agent). */
  headers?: Record<string, string>;
  /** Lower = preferred. Direct HLS defaults to 0; embeds to 50. */
  priority?: number;
}

export interface I18nProviderMeta {
  name: string;
  /** Languages this provider is known to serve. */
  languages: string[];
  /** Display emoji/flag for logs/UI. */
  flag?: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export abstract class BaseI18nProvider implements StreamProvider {
  abstract readonly name: string;
  abstract readonly meta: I18nProviderMeta;

  /** Subclass hook: return raw sources for a given episode. */
  protected abstract resolveEpisode(opts: SourceOptions): Promise<RawDubSource[]>;

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const raw = await this.resolveEpisode(opts).catch(() => [] as RawDubSource[]);
    return this.ingest(raw);
  }

  // StreamProvider shape — i18n providers are episode-only.
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    return this.single(opts);
  }
  async movie(opts: SourceOptions): Promise<SourceResult[]> {
    return this.single(opts);
  }

  /**
   * Per-episode language capabilities for the Tatakai auto-download engine.
   * We advertise every language the provider declares (and the specific one
   * requested if we can confirm it from the page). The engine matches these
   * against the user's `preferredLanguages`.
   */
  async getLanguages(opts: SourceOptions): Promise<{ language: string; label: string; type: 'audio' | 'subtitle' }[]> {
    const out: { language: string; label: string; type: 'audio' | 'subtitle' }[] = [];
    const seen = new Set<string>();
    for (const code of this.meta.languages) {
      const lang = DUB_LANGUAGES[code];
      if (!lang || seen.has(code)) continue;
      seen.add(code);
      out.push({ language: code, label: lang.label, type: 'audio' });
    }
    // If the caller asks for a specific language we don't advertise, let the
    // engine treat us as a candidate anyway (heuristic fallback).
    void opts;
    return out;
  }

  /** Convert raw provider records into SourceResults, categorized by language. */
  protected ingest(raw: RawDubSource[]): SourceResult[] {
    const seen = new Set<string>();
    const results: SourceResult[] = [];

    const scored = raw
      .filter(r => r && typeof r.url === 'string' && r.url.length > 0)
      .map(r => {
        const url = r.url.trim();
        const type = detectSourceType(url);
        const isDirect = type === 'hls' || type === 'mp4';
        const priority = r.priority ?? (isDirect ? 0 : 50);
        return { ...r, url, _type: type, _priority: priority };
      })
      .sort((a, b) => a._priority - b._priority);

    for (const r of scored) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      const code = toAudioLanguageCode(r.language || this.meta.languages[0]);
      const lang: DubLanguage | undefined = DUB_LANGUAGES[code];
      const label = lang?.label || code;

      results.push({
        source: `${this.name}-${r.server}`.replace(/\s+/g, '-').toLowerCase(),
        url: r.url,
        quality: r.quality || (r._type === 'hls' ? 'auto' : ''),
        headers: {
          'User-Agent': UA,
          ...(r.headers || {}),
        },
        subtitles: r.subtitles || [],
        // BCP 47 code the Watch page uses to build the language tab key.
        audioLanguage: code,
        // Human-readable "Arabic Dub" / "French" for the tab label.
        language: lang?.isDub ? `${label} Dub` : label,
        sourceType: r._type,
        providerName: this.name,
        providerKey: this.name,
        server: r.server,
      });
    }

    return results;
  }
}

/**
 * Group SourceResults by their audioLanguage code. The Watch page uses this to
 * render one tab per dub language; the auto-download engine can iterate codes
 * in user-preference order.
 */
export function categorizeByLanguage(sources: SourceResult[]): Map<string, SourceResult[]> {
  const map = new Map<string, SourceResult[]>();
  for (const s of sources) {
    const key = (s.audioLanguage || s.language || 'und').toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}
