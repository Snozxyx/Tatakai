import { useEffect, useRef, useState } from 'react';
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
  if (cueCache.size >= CUE_CACHE_MAX) {
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
  const [state, setState] = useState<{ lines: string[] | null; translating: boolean }>({
    lines: null,
    translating: false,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    if (!enabled || !activeCueLines.length || !activeCueLines.some((line) => line.trim())) {
      setState((prev) => (prev.lines === null && !prev.translating ? prev : { lines: null, translating: false }));
      return;
    }

    const cached = activeCueLines.map((line) => cueCache.get(cacheKey(line, target)));
    if (cached.every((value) => value !== undefined)) {
      setState({ lines: cached as string[], translating: false });
      return;
    }

    setState((prev) => ({ lines: null, translating: true }));
    void (async () => {
      try {
        const result = await translateTexts(activeCueLines, { target, timeoutMs: 15_000 });
        result.texts.forEach((translated, index) => {
          const original = activeCueLines[index];
          if (typeof translated === 'string' && typeof original === 'string') {
            rememberCue(original, target, translated);
          }
        });
        if (requestRef.current !== request) return;
        setState({ lines: result.texts, translating: false });
      } catch {
        // Keep the original cues visible; the next cuechange retries uncached lines.
        if (requestRef.current !== request) return;
        setState((prev) => ({ lines: null, translating: false }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, key]);

  return state;
}
