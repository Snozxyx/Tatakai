import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslationConfig } from './useTranslationConfig';
import { resolveTargetLanguage } from '@/lib/translation/config';
import { translateTexts } from '@/lib/translation/translate';

/**
 * Novel chapter translation. Paragraphs are sent to the configured engine in
 * small sequential batches and results are merged progressively, so translated
 * text appears as it arrives instead of waiting for a whole chapter. Every
 * paragraph is memoized per (text, target) in a module-level map — replaying or
 * re-opening a chapter is instant; results land 1:1 by paragraph index and the
 * reader keeps the original available behind "Show original".
 */

const BATCH = 20;
const CACHE_MAX = 3000;
const MAX_PARAGRAPH = 4000;
const MAX_PARAGRAPHS = 800;

type Paragraph = { index: number; text: string };

const cache = new Map<string, string>();

function cacheKey(text: string, target: string) {
  return `${target}|${text}`;
}

function cachePut(text: string, target: string, value: string) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(cacheKey(text, target), value);
}

export type NovelTranslationState = {
  /** index → translated paragraph; missing entries stay original. */
  map: Record<number, string>;
  status: 'idle' | 'translating' | 'done' | 'error';
  target: string;
};

export function useNovelTranslation(paragraphs: Paragraph[]): NovelTranslationState {
  const config = useTranslationConfig();
  const enabled = config.enabled && config.translateNovels;
  const target = resolveTargetLanguage();
  const clean = useMemo(
    () =>
      paragraphs
        .filter((p) => p.text.trim() && p.text.length <= MAX_PARAGRAPH)
        .slice(0, MAX_PARAGRAPHS),
    [paragraphs],
  );
  const [map, setMap] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<NovelTranslationState['status']>('idle');
  const runRef = useRef(0);

  useEffect(() => {
    const run = ++runRef.current;
    if (!enabled || clean.length === 0) {
      setStatus('idle');
      return;
    }
    setMap({});
    setStatus('translating');
    void (async () => {
      try {
        for (let start = 0; start < clean.length; start += BATCH) {
          if (run !== runRef.current) return;
          const batch = clean.slice(start, start + BATCH);
          const pending = batch.filter((p) => !cache.has(cacheKey(p.text, target)));
          if (pending.length > 0) {
            const result = await translateTexts(
              pending.map((p) => p.text),
              { target, timeoutMs: 30_000 },
            );
            pending.forEach((p, i) => {
              const translated = result.texts[i];
              if (typeof translated === 'string') cachePut(p.text, target, translated);
            });
          }
          if (run !== runRef.current) return;
          setMap((prev) => {
            const next = { ...prev };
            for (const p of batch) {
              const hit = cache.get(cacheKey(p.text, target));
              if (hit !== undefined && hit.trim() !== p.text.trim()) next[p.index] = hit;
            }
            return next;
          });
        }
        if (run === runRef.current) setStatus('done');
      } catch {
        // Keep whatever finished; the reader falls back to the original text.
        if (run === runRef.current) setStatus('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, clean]);

  return { map, status, target };
}
