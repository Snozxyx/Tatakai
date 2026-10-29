import { useEffect, useState } from 'react';
import { useTranslationConfig, } from '@/hooks/translation/useTranslationConfig';
import { resolveTargetLanguage } from '@/lib/translation/config';
import { translateTexts } from '@/lib/translation/translate';

/**
 * Live subtitle translation. Translates the currently displayed cue lines via
 * the configured engine and returns them 1:1; `null` means "pass the original
 * cues through" (disabled, still translating, or engine failure).
 *
 * Cues repeat across seeks and replays, so translations are memoized per
 * (text, target) in a module-level map — the hook stays synchronous whenever
 * every active cue is already cached.
 */

export const cueCache = new Map<string, string>();
const CUE_CACHE_MAX = 2000;

export function cacheKey(text: string, target: string) {
  return `${target}|${text}`;
}

/** Insert into the shared cue cache with FIFO eviction. */
export function rememberCue(text: string, target: string, translated: string) {
  const key = cacheKey(text, target);
  // A late batch returning unchanged input must not erase a translated cue.
  if (translated === text && cueCache.has(key) && cueCache.get(key) !== text) return;
  if (cueCache.size >= CUE_CACHE_MAX && !cueCache.has(key)) {
    const first = cueCache.keys().next().value;
    if (first !== undefined) cueCache.delete(first);
  }
  cueCache.set(cacheKey(text, target), translated);
}

export function useSubtitleTranslation(activeCueLines: string[]): {
  lines: string[] | null;
  translating: boolean;
} {
  const config = useTranslationConfig();
  const enabled = config.enabled && config.subtitleTranslate;
  const target = resolveTargetLanguage(config.subtitleTargetLanguage || undefined);
  const key = activeCueLines.join('\u0000');
  const identity = `${target}\u0001${key}`;
  const [state, setState] = useState<{ identity: string; lines: string[] | null; translating: boolean }>({ identity: '', lines: null, translating: false });
  useEffect(() => {
    if (!enabled || !key.trim()) return;
    const controller = new AbortController();
    const lines = key.split('\u0000');
    if (lines.every(line => cueCache.has(cacheKey(line, target)))) return;
    setState({ identity, lines: null, translating: true });
    void translateTexts(lines, { target, timeoutMs: 15_000, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.texts.length !== lines.length) throw new Error('Subtitle translation line mismatch');
      result.texts.forEach((text, index) => rememberCue(lines[index], target, text));
      setState({ identity, lines: result.texts, translating: false });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ identity, lines: null, translating: false });
    });
    return () => controller.abort();
  }, [enabled, target, key, identity]);

  if (!enabled || !activeCueLines.length) return { lines: null, translating: false };
  const cached = activeCueLines.map(line => cueCache.get(cacheKey(line, target)));
  if (cached.every(line => line !== undefined)) return { lines: cached as string[], translating: false };
  return state.identity === identity ? { lines: state.lines, translating: state.translating } : { lines: null, translating: true };
}
