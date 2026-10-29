import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { captureUpscaleSample, upscaleImage, type EnhancementQuality, type UpscalerEngine } from '@/lib/upscaling';
import type { Anime4KMode } from '@/lib/video/anime4k/Anime4KRenderer';
import { enhanceRtxSample } from '@/lib/video/rtx-video';

export function UpscalerPreview({ engine, preset = 'standard', scale = 2, quality = 'balanced', disabled = false }: {
  engine: UpscalerEngine | 'rtx'; preset?: Anime4KMode; scale?: 2 | 4; quality?: EnhancementQuality; disabled?: boolean;
}) {
  const [original, setOriginal] = useState<Blob>();
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [progress, setProgress] = useState<number>();
  const [size, setSize] = useState('');
  const chosenFile = useRef<File>();
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController>();
  useEffect(() => {
    request.current?.abort(); setBusy(false); setAfter(''); setError('');
    return () => request.current?.abort();
  }, [engine, preset, scale, quality]);
  useEffect(() => {
    if (!original) return;
    const url = URL.createObjectURL(original); setBefore(url);
    return () => URL.revokeObjectURL(url);
  }, [original]);
  useEffect(() => () => { if (after) URL.revokeObjectURL(after); }, [after]);

  const preview = async (file?: File, refresh = false) => {
    if (engine === 'off') return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setAfter(''); setProgress(undefined); setSize('');
    if (file) chosenFile.current = file;
    if (refresh) chosenFile.current = undefined;
    try {
      const sample = file || refresh || !original ? await captureUpscaleSample(file || chosenFile.current) : original;
      if (controller.signal.aborted) return;
      setOriginal(sample);
      const result = engine === 'rtx' ? await enhanceRtxSample(sample, quality, controller.signal) : await upscaleImage(sample, engine, preset, scale, controller.signal, { quality, preview: true, onProgress: setProgress });
      if (!controller.signal.aborted) setAfter(URL.createObjectURL(result));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Preview failed. Try another image.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={disabled || busy || engine === 'off'} onClick={() => void preview()}>{busy ? `Enhancing preview…${progress == null ? '' : ` ${progress}%`}` : after ? 'Refresh preview' : 'Preview before / after'}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled || busy || engine === 'off'} onClick={() => fileRef.current?.click()}>Choose image</Button>
      {before && <Button type="button" variant="ghost" size="sm" disabled={disabled || busy || engine === 'off'} onClick={() => void preview(undefined, true)}>Capture current sample</Button>}
      {busy && <Button type="button" variant="ghost" size="sm" onClick={() => { request.current?.abort(); setBusy(false); }}>Cancel preview</Button>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose an upscaling preview image" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void preview(file); event.target.value = ''; }} />
    </div>
    <p className="text-xs text-muted-foreground">Preview a small sample of the current page or video frame, or choose your own image. A demo image is used when nothing is open.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {before && <div aria-busy={busy} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{engine === 'manga' ? 'Manga Upscaler · MangaJaNai' : engine === 'realesrgan' ? 'Real-ESRGAN' : engine === 'rtx' ? 'NVIDIA RTX Video' : 'Anime4K'}{size && ` · ${size}`}</span>
        <div role="group" aria-label="Preview zoom" className="flex gap-1">{[1, 2, 4].map(value => <Button key={value} type="button" variant={zoom === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{value}×</Button>)}</div>
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border border-border bg-muted" tabIndex={0} aria-label="Scrollable upscaling comparison">
      <div className="relative" style={{ width: `${zoom * 100}%` }}>
        <img src={before} alt="Original preview" className="block h-auto w-full object-contain" style={{ maxHeight: 288 * zoom }} />
        {after && <img src={after} alt="Enhanced preview" onLoad={event => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)} className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />}
        {after && <div aria-hidden className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${split}%` }} />}
      </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>Original</span><span>{after ? 'Enhanced' : busy ? 'Processing…' : 'Preview sample'}</span></div>
      {after && <input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Compare original and enhanced image" className="w-full accent-primary" />}
    </div>}
  </div>;
}
