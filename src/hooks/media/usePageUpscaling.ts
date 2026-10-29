import { useEffect, useRef, useState } from 'react';
import type { ReaderSettings } from './useReaderSettings';
import { upscaleImage } from '@/lib/upscaling';

export type PageUpscalingSettings = Pick<ReaderSettings, 'upscaler' | 'upscalePreset' | 'upscaleScale'> & Partial<Pick<ReaderSettings, 'upscaleQuality'>>;
export function usePageUpscaling(src: string | undefined, loaded: boolean, settings?: PageUpscalingSettings) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ source: string; engine: string; preset: string; scale: number; url: string }>();
  const [state, setState] = useState('');
  const [attempt, setAttempt] = useState(0);
  const engine = settings?.upscaler ?? 'off';
  const preset = settings?.upscalePreset ?? 'standard';
  const scale = settings?.upscaleScale ?? 2;
  const quality = settings?.upscaleQuality ?? 'balanced';
  useEffect(() => {
    if (!ref.current || engine === 'off') return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [engine]);
  useEffect(() => {
    setResult(undefined); setState('');
    if (!src || !loaded || !visible || engine === 'off') return;
    const controller = new AbortController();
    let owned: string;
    const enhance = async () => {
      setState('Enhancing page…');
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error('This source could not be enhanced.');
        const blob = await response.blob();
        const rect = ref.current?.getBoundingClientRect();
        const priority = rect ? Math.round(80 - Math.min(60, Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2) / innerHeight * 60)) : 50;
        const output = await upscaleImage(blob, engine, preset, scale, controller.signal, {
          quality, priority,
          onProgress: progress => { if (!controller.signal.aborted) setState(`Enhancing page… ${progress}%`); },
        });
        if (controller.signal.aborted) return;
        owned = URL.createObjectURL(output);
        setResult({ source: src, engine, preset, scale, url: owned }); setState('');
      } catch (err) {
        if (!controller.signal.aborted) setState(`Showing original. ${err instanceof Error ? err.message : 'Enhancement failed.'}`);
      }
    };
    void enhance();
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned); };
  }, [src, loaded, visible, engine, preset, scale, quality, attempt]);
  const enhanced = result && visible && result.source === src && result.engine === engine && result.preset === preset && result.scale === scale ? result.url : undefined;
  return { ref, enhanced, state, retry: () => setAttempt(value => value + 1) };
}
