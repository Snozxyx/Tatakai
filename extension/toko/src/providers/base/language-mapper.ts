/**
 * Toko → Tatakai language mapping.
 *
 * The Tatakai Watch page (`SourceLanguageTabs`, auto-download language
 * resolver) groups sources by a normalized language key. This module maps the
 * BCP 47 `audioLanguage` codes produced by every Toko provider (both the
 * original stream providers and the new i18n dub providers) into that system:
 *
 *   categorizeSources(sources)
 *     → Map<languageKey, SourceResult[]>
 *
 * `languageKey` is the same value `normalizeWatchLanguageKey()` produces
 * (lowercased, spaces → hyphens), so the Watch page's tabs and the user's
 * `preferredLanguages` ordering work without any adapter code.
 */
import type { SourceResult } from '../../types/index.js';
import { DUB_LANGUAGES, resolveDubLanguage } from '../base/dub-languages.js';

export interface CategorizedSources {
  /** "sub" (Japanese/und), "dub" (English/other), or a specific code. */
  category: 'sub' | 'dub' | string;
  /** BCP 47 code, e.g. "ar", "fr". */
  code: string;
  /** Human label, e.g. "Arabic", "French Dub". */
  label: string;
  sources: SourceResult[];
}

/**
 * Pick the effective language code for a source. i18n providers set
 * `audioLanguage` to a BCP 47 code; legacy providers may set `language` to a
 * free-form string like "Japanese/Sub". We normalize both.
 */
export function sourceLanguageCode(src: SourceResult): string {
  const explicit = (src.audioLanguage || '').trim().toLowerCase();
  if (explicit) return explicit;
  const lang = (src.language || '').trim();
  const resolved = resolveDubLanguage(lang);
  if (resolved) return resolved.code;
  // Legacy labels: "Japanese/Sub" → ja, "English/Dub" → en.
  if (/japan|jap|\bsub\b/i.test(lang)) return 'ja';
  if (/english|\bdub\b/i.test(lang)) return 'en';
  if (/hindi/i.test(lang)) return 'hi';
  return lang ? lang.toLowerCase().replace(/\s+/g, '-') : 'und';
}

/** Group an array of sources by their dub language code. */
export function categorizeByDubLanguage(sources: SourceResult[]): Map<string, SourceResult[]> {
  const map = new Map<string, SourceResult[]>();
  for (const src of sources) {
    const code = sourceLanguageCode(src);
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(src);
  }
  return map;
}

/** Build the categorized structure the UI/engine consumes. */
export function categorizeSources(sources: SourceResult[]): CategorizedSources[] {
  const byCode = categorizeByDubLanguage(sources);
  const out: CategorizedSources[] = [];
  for (const [code, list] of byCode) {
    const meta = DUB_LANGUAGES[code];
    const isSub = code === 'ja' || code === 'und';
    out.push({
      category: isSub ? 'sub' : 'dub',
      code,
      label: meta ? (meta.isDub ? `${meta.label} Dub` : meta.label) : code.toUpperCase(),
      sources: list,
    });
  }
  // Sub first, then dubs sorted alphabetically by label.
  return out.sort((a, b) => {
    if (a.category === 'sub' && b.category !== 'sub') return -1;
    if (b.category === 'sub' && a.category !== 'sub') return 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Pick sources matching the user's preferred languages (in priority order).
 * Falls back to Japanese sub, then anything.
 */
export function selectByPreferredLanguages(
  sources: SourceResult[],
  preferredLanguages: string[],
): SourceResult[] {
  if (!sources.length) return [];
  const byCode = categorizeByDubLanguage(sources);

  for (const pref of preferredLanguages) {
    const code = resolveDubLanguage(pref)?.code ?? pref.toLowerCase();
    const match = byCode.get(code);
    if (match && match.length) return match;
  }
  // Fallback: Japanese sub, then the first available group.
  return byCode.get('ja') || sources;
}
