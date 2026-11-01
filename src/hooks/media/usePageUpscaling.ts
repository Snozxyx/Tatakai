import { useEffect, useRef, useState } from 'react';
import type { ReaderSettings } from './useReaderSettings';
import { upscaleImage, withUpscaleSlot } from '@/lib/upscaling';
import { markUpscaleDone, waitForEngineReady } from '@/lib/reader/upscaleProgress';

export type PageUpscalingSettings = Pick<ReaderSettings, 'upscaler' | 'upscalePreset' | 'upscaleScale'> & Partial<Pick<ReaderSettings, 'upscaleQuality'>>;

type UpscaleResult = { source: string; engine: string; preset: string; scale: number; url: string };

/**
 * The desktop upscaler processes one image at a time. When the model is still
 * busy with another page (manga upscaler / Real-ESRGAN) it answers
 * "upscaler is busy" — wait with growing backoff and re-submit instead of
 * surfacing a permanent error that needs a manual retry.
 */
const BUSY_RETRY_DELAYS = [1000, 1600, 2600, 4000, 4000, 4000, 4000, 4000];

/**
 * Per-page enhancement that runs at most once per source image and keeps the
 * result cached for the lifetime of that source, so scrolling never re-shows a
 * busy state or drops back to the original image.
 *
 * Enhancement starts for EVERY page of the chapter the moment its source is
 * available — not when it scrolls into view — so turning the upscaler on
 * upscales the whole chapter up front ("upscale everything first"). Progress
 * is reported to the chapter-level pill (via `scope`); the page itself shows
 * no "Enhancing page…" text in the middle of the art.
 *
 * Native engines wait (shared across pages) for setup to finish before the
 * first enhancement, so enabling never fires work at a half-installed model.
 */
export function usePageUpscaling(src: string | undefined, settings?: PageUpscalingSettings, scope?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<UpscaleResult>();
  const [state, setState] = useState('');
  const [attempt, setAttempt] = useState(0);
  const engine = settings?.upscaler ?? 'off';
  const preset = settings?.upscalePreset ?? 'standard';
  const scale = settings?.upscaleScale ?? 2;
  const quality = settings?.upscaleQuality ?? 'balanced';

  // The blob URL currently on screen. Released only when it is replaced by a
  // newer enhanced version or on unmount — never on scroll or a source change,
  // so the image never drops back to the original while a re-enhance runs.
  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current); }, []);
  const commitResult = (next: UpscaleResult | undefined) => {
    const previous = resultUrlRef.current;
    if (previous && previous !== next?.url) URL.revokeObjectURL(previous);
    resultUrlRef.current = next?.url ?? null;
    setResult(next);
  };

  // Enhancement identity: source + engine config + retry nonce. A change here
  // (new image, new upscaler, manual retry) is the only thing that restarts it.
  const enhanceKey = `${src}\u0000${engine}\u0000${preset}\u0000${scale}\u0000${quality}\u0000${attempt}`;
  const enhanceKeyRef = useRef('');
  const enhanceKeyChanged = enhanceKeyRef.current !== enhanceKey;

  useEffect(() => {
    if (!src || engine === 'off') return;
    // Already enhanced (or already tried) for this exact source/config — keep
    // the cached result instead of re-running on scroll.
    if (!enhanceKeyChanged && result?.source === src) return;
    enhanceKeyRef.current = enhanceKey;
    // Keep any existing enhanced image on screen — a source change or manual
    // retry never flashes the original (the state line, when shown, only ever
    // carries a failure, never an in-page "Enhancing…" banner).
    const controller = new AbortController();
    let busyStep = 0;
    // Higher = closer to the viewport centre, so the pages you are reading get
    // enhanced before the rest of the chapter.
    const computePriority = () => {
      const rect = ref.current?.getBoundingClientRect();
      return rect
        ? Math.round(80 - Math.min(60, Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2) / innerHeight * 60))
        : 50;
    };

    const enhance = async (blob: Blob, priority: number) => {
      if (controller.signal.aborted) return;
      try {
        const output = await upscaleImage(blob, engine, preset, scale, controller.signal, {
          quality,
          priority,
        });
        if (controller.signal.aborted) return;
        commitResult({ source: src, engine, preset, scale, url: URL.createObjectURL(output) });
        if (scope) markUpscaleDone(scope);
        setState('');
      } catch (err) {
        if (controller.signal.aborted) return;
        // "upscaler is busy" — the desktop engine is still working on another
        // page. Back off and re-submit; a page mid-chapter must not end up
        // stuck on "Showing original" because the queue was momentarily full.
        if (err instanceof Error && /upscaler is busy/i.test(err.message) && busyStep < BUSY_RETRY_DELAYS.length) {
          const delay = BUSY_RETRY_DELAYS[busyStep];
          busyStep += 1;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return enhance(blob, priority);
        }
        setState(`Showing original. ${err instanceof Error ? err.message : 'Enhancement failed.'}`);
      }
    };

    const run = async () => {
      try {
        // Setup before enable: native engines must be installed and loaded
        // before the bridge will accept work. Wait (shared across all pages)
        // so we never fire enhancement at a half-set-up model.
        if (engine === 'realesrgan' || engine === 'manga') {
          if (!window.electron?.upscaler) {
            setState('Showing original. AI upscaling runs in the Tatakai desktop app — choose Anime4K on this device.');
            return;
          }
          const ready = await waitForEngineReady(engine, controller.signal);
          if (!ready || controller.signal.aborted) {
            if (!controller.signal.aborted) {
              setState('Showing original. The upscaler is not set up yet — open Reader settings → Reader page enhancement to set it up.');
            }
            return;
          }
        }
        // Fetch + enhance run under ONE shared slot so enabling the upscaler
        // on a whole chapter never fetches/decodes dozens of pages at once —
        // a few chains run concurrently, nearest-viewport first, and the rest
        // of the chapter is enhanced in the background as slots free up.
        await withUpscaleSlot(computePriority(), async () => {
          if (controller.signal.aborted) return;
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) throw new Error('This source could not be enhanced.');
          const blob = await response.blob();
          await enhance(blob, computePriority());
        });
      } catch (err) {
        if (!controller.signal.aborted) setState(`Showing original. ${err instanceof Error ? err.message : 'Enhancement failed.'}`);
      }
    };
    void run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, engine, preset, scale, quality, attempt]);

  // Keep the enhanced version once it exists — no visibility gate, so scrolling
  // away and back never falls back to the un-enhanced image.
  const enhanced =
    result && result.source === src && result.engine === engine && result.preset === preset && result.scale === scale
      ? result.url
      : undefined;
  return { ref, enhanced, state, retry: () => setAttempt(value => value + 1) };
}
