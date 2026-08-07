/**
 * src/core/download/language-resolver.ts
 *
 * Language Resolution Engine for the Tatakai Auto-Download System.
 *
 * This module is the bridge between a user's ordered language preference list
 * and the set of installed extensions. For each episode, it:
 *   1. Queries each extension (in priority order) for available languages via `getEpisodeLanguages()`
 *   2. Matches against the user's `preferredLanguages` list in order
 *   3. Returns the first (extension, resolvedLanguage) pair that satisfies a preference
 *   4. Falls back through the configured fallback mode when nothing matches
 *
 * Language alias map ensures that common shorthands are normalized:
 *   'sub' / 'ja' / 'japanese' / 'jpn'  → canonical 'ja'
 *   'dub' / 'en' / 'english' / 'eng'   → canonical 'en'
 *   'hi'  / 'hindi'                     → canonical 'hi'
 *   etc.
 */

import type { ExtensionSearchProvider } from '../extensions/ExtensionRegistry';
import type { LanguageCapability } from '../extensions/sdk/types';

// ---------------------------------------------------------------------------
// Language alias normalization
// ---------------------------------------------------------------------------

/**
 * Maps common shorthands and full language names to their BCP 47 canonical tag.
 * Extensions may return various strings; we normalize before comparison.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  // Japanese
  ja: 'ja', jpn: 'ja', japanese: 'ja', sub: 'ja',
  // English
  en: 'en', eng: 'en', english: 'en', dub: 'en',
  'dual audio': 'en', 'multi audio': 'en', multi: 'en',
  // Hindi
  hi: 'hi', hin: 'hi', hindi: 'hi',
  // Spanish
  es: 'es', spa: 'es', spanish: 'es',
  // Portuguese
  pt: 'pt', por: 'pt', portuguese: 'pt',
  // French
  fr: 'fr', fra: 'fr', fre: 'fr', french: 'fr',
  // Korean
  ko: 'ko', kor: 'ko', korean: 'ko',
  // Chinese
  zh: 'zh', chi: 'zh', zho: 'zh', chinese: 'zh',
  // Arabic
  ar: 'ar', ara: 'ar', arabic: 'ar',
  // German
  de: 'de', deu: 'de', ger: 'de', german: 'de',
  // Italian
  it: 'it', ita: 'it', italian: 'it',
  // Thai
  th: 'th', tha: 'th', thai: 'th',
};

/**
 * Normalizes a language code/name to its canonical BCP 47 tag.
 * Returns the input lowercased if no alias is found (best-effort passthrough).
 */
export function normalizeLanguage(lang: string): string {
  if (!lang) return '';
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

/**
 * Returns a human-readable label for a canonical language tag.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  ja: 'Japanese', en: 'English', hi: 'Hindi', es: 'Spanish',
  pt: 'Portuguese', fr: 'French', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', de: 'German', it: 'Italian', th: 'Thai',
};

export function getLanguageLabel(canonicalLang: string): string {
  return LANGUAGE_LABELS[canonicalLang] ?? canonicalLang.toUpperCase();
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface LanguageResolutionResult {
  /** The extension provider that has the matched language. */
  provider: ExtensionSearchProvider;
  /** The canonical language code matched (e.g. 'ja', 'en', 'hi'). */
  resolvedLanguage: string;
  /** Human-readable language label for display/toast purposes. */
  languageLabel: string;
  /**
   * Whether this is a strict match (extension confirmed it for this episode)
   * or a heuristic match (extension returned [] from getEpisodeLanguages and
   * we fell back to treating it as language-agnostic).
   */
  matchType: 'strict' | 'heuristic' | 'fallback-default';
  /** The raw LanguageCapability entries returned by the extension (empty for heuristic). */
  capabilities: LanguageCapability[];
}

// ---------------------------------------------------------------------------
// Core resolution function
// ---------------------------------------------------------------------------

/**
 * Resolves the best (extension, language) pair for a specific episode.
 *
 * The algorithm:
 * 1. For each extension in `providers` (already in priority order):
 *    a. Call `getEpisodeLanguages(anilistId, episode)` if implemented
 *    b. Normalize returned language codes
 *    c. For each language in `preferredLanguages`:
 *       - If the extension serves it → STRICT MATCH → return immediately
 * 2. If an extension returned [] from getEpisodeLanguages (language-agnostic):
 *    - Queue as a "heuristic" candidate (used as last resort within its priority slot)
 * 3. If no strict match anywhere:
 *    - If there are heuristic candidates → return the highest-priority one
 * 4. If `defaultLanguage` is set and differs from all preferred languages:
 *    - Try again with [defaultLanguage] → return FALLBACK_DEFAULT match
 * 5. Return null → caller should show error
 *
 * @param providers - Extensions to try, already sorted by priority
 * @param anilistId - AniList ID of the anime
 * @param episode - Episode number
 * @param preferredLanguages - Ordered list of canonical or alias language codes
 * @param defaultLanguage - Optional global fallback language
 */
export async function resolveExtensionForEpisode(
  providers: ExtensionSearchProvider[],
  anilistId: number,
  episode: number,
  preferredLanguages: string[],
  defaultLanguage?: string,
): Promise<LanguageResolutionResult | null> {
  if (!providers.length) return null;

  const normalizedPreferred = preferredLanguages.map(normalizeLanguage).filter(Boolean);

  // Pre-fetch all capabilities to avoid repeating async calls in nested loops
  const providerCapabilities = new Map<string, { provider: ExtensionSearchProvider; capabilities: LanguageCapability[]; normalized: string[] }>();
  const heuristicCandidates: ExtensionSearchProvider[] = [];

  for (const provider of providers) {
    let capabilities: LanguageCapability[] = [];
    try {
      if (typeof provider.getEpisodeLanguages === 'function') {
        capabilities = await provider.getEpisodeLanguages(anilistId, episode);
      }
    } catch (err) {
      console.warn(`[LanguageResolver] ${provider.name} getEpisodeLanguages failed:`, err);
      capabilities = [];
    }

    if (capabilities.length === 0) {
      heuristicCandidates.push(provider);
    } else {
      providerCapabilities.set(provider.id, {
        provider,
        capabilities,
        normalized: capabilities.map(cap => normalizeLanguage(cap.language)),
      });
    }
  }

  // Phase 1: strict matching - prioritize language preference order first
  for (const preferred of normalizedPreferred) {
    for (const provider of providers) {
      const entry = providerCapabilities.get(provider.id);
      if (!entry) continue;

      const idx = entry.normalized.indexOf(preferred);
      if (idx !== -1 && entry.capabilities[idx].type === 'audio') {
        const cap = entry.capabilities[idx];
        return {
          provider,
          resolvedLanguage: preferred,
          languageLabel: cap.label || getLanguageLabel(preferred),
          matchType: 'strict',
          capabilities: entry.capabilities,
        };
      }
    }
  }

  // Phase 2: heuristic (language-agnostic extension → use first preferred)
  if (heuristicCandidates.length > 0) {
    const provider = heuristicCandidates[0];
    const resolvedLanguage = normalizedPreferred[0] ?? 'ja';
    return {
      provider,
      resolvedLanguage,
      languageLabel: getLanguageLabel(resolvedLanguage),
      matchType: 'heuristic',
      capabilities: [],
    };
  }

  // Phase 3: global default language fallback
  if (defaultLanguage) {
    const normalizedDefault = normalizeLanguage(defaultLanguage);
    if (!normalizedPreferred.includes(normalizedDefault)) {
      for (const provider of providers) {
        const entry = providerCapabilities.get(provider.id);
        if (entry) {
          const idx = entry.normalized.indexOf(normalizedDefault);
          if (idx !== -1 && entry.capabilities[idx].type === 'audio') {
            const cap = entry.capabilities[idx];
            return {
              provider,
              resolvedLanguage: normalizedDefault,
              languageLabel: cap.label || getLanguageLabel(normalizedDefault),
              matchType: 'fallback-default',
              capabilities: entry.capabilities,
            };
          }
        } else if (heuristicCandidates.includes(provider)) {
          return {
            provider,
            resolvedLanguage: normalizedDefault,
            languageLabel: getLanguageLabel(normalizedDefault),
            matchType: 'fallback-default',
            capabilities: [],
          };
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Utility: describe a resolution result for logging / toast messages
// ---------------------------------------------------------------------------

export function describeResolution(result: LanguageResolutionResult): string {
  const matchDesc = {
    strict: 'exact language match',
    heuristic: 'language-agnostic source',
    'fallback-default': 'global default language fallback',
  }[result.matchType];
  return `${result.provider.name} [${result.languageLabel}] via ${matchDesc}`;
}
