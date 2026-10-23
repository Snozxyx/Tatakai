import { useEffect, useRef } from 'react';
import { sanitizeCueText } from '@/core/player/subtitle-utils';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
import { resolveTargetLanguage } from '@/lib/translation/config';
import { translateTexts } from '@/lib/translation/translate';
import { cacheKey, cueCache, rememberCue } from './useSubtitleTranslation';

/**
 * Whole-track subtitle pre-translation.
 *
 * When enabled, the selected track is translated upfront — in small batches so
 * a huge track starts producing results immediately instead of one giant slow
 * request — and results are written into the same cue cache the live per-cue
 * hook reads. Playback then renders translated cues synchronously; no cue ever
 * flashes the original text while a request is in flight. Cues that have not
 * finished pre-translating yet still fall back to the live per-cue path.
 */

const BATCH_MAX_LINES = 40;
const BATCH_MAX_CHARS = 3000;
const CUES_POLL_MS = 500;
const CUES_POLL_LIMIT = 30;

function pickTrack(video: HTMLVideoElement | null): TextTrack | null {
  if (!video) return null;
  const tracks = video.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i].mode === 'showing') return tracks[i];
  }
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i].mode === 'hidden') return tracks[i];
  }
  return null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function chunk(texts: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (batch.length && (batch.length >= BATCH_MAX_LINES || chars + text.length > BATCH_MAX_CHARS)) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(text);
    chars += text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function useSubtitlePretranslation(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  refreshKey: unknown,
) {
  const config = useTranslationConfig();
  const enabled = config.enabled && config.subtitleTranslate && config.subtitlePretranslate;
  const target = resolveTargetLanguage(config.subtitleTargetLanguage || undefined);
  const runRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const run = ++runRef.current;
    const controller = new AbortController();

    void (async () => {
      let texts: string[] | null = null;
      for (let attempt = 0; attempt < CUES_POLL_LIMIT; attempt++) {
        if (controller.signal.aborted || runRef.current !== run) return;
        const cues = pickTrack(videoRef.current)?.cues;
        if (cues && cues.length) {
          const unique = new Set<string>();
          for (let i = 0; i < cues.length; i++) {
            const text = sanitizeCueText((cues[i] as VTTCue).text);
            if (text.trim() && !cueCache.has(cacheKey(text, target))) unique.add(text);
          }
          texts = [...unique];
          break;
        }
        await sleep(CUES_POLL_MS, controller.signal);
      }
      if (!texts?.length || controller.signal.aborted || runRef.current !== run) return;

      for (const batch of chunk(texts)) {
        if (controller.signal.aborted || runRef.current !== run) return;
        try {
          const result = await translateTexts(batch, {
            target,
            timeoutMs: 20_000,
            signal: controller.signal,
          });
          result.texts.forEach((translated, index) => {
            const original = batch[index];
            if (typeof translated === 'string') rememberCue(original, target, translated);
          });
        } catch {
          // Skip the failed batch; the live per-cue path still covers it.
        }
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, refreshKey]);
}
