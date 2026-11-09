import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Film, BookOpen, Loader2, SlidersHorizontal, Play, Pause } from 'lucide-react';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { upscaleImage, withUpscaleSlot } from '@/lib/upscaling';
import mangaEnhanced from '@/assets/landing-enhancers/manga-enhanced.webp?inline';
import mangaOriginal from '@/assets/landing-enhancers/manga-preview-original.webp?inline';
import animeDemo from '@/assets/landing-enhancers/anime-demo.mp4?url';
import animePoster from '@/assets/landing-enhancers/anime-demo-poster.webp?inline';
import type { Anime4KMode, Anime4KRenderer } from '@/lib/video/anime4k/Anime4KRenderer';


function AnimeVideoSample() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const renderer = useRef<Anime4KRenderer>();
  const [playing, setPlaying] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<Anime4KMode>('standard');
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState(50);
  const [error, setError] = useState('');

  useEffect(() => {
    const media = video.current, target = canvas.current;
    setReady(false); setError('');
    if (!enabled || !media || !target) return;
    let disposed = false, starting = false;
    const prepare = async () => {
      if (disposed || starting || renderer.current || media.readyState < 2) return;
      starting = true;
      try {
        const { Anime4KRenderer: Renderer } = await import('@/lib/video/anime4k/Anime4KRenderer');
        if (disposed) return;
        if (!Renderer.isSupported()) throw new Error(uiI18n.t('landingEnhancers.videoUnavailable'));
        const instance = new Renderer(media, target); renderer.current = instance;
        instance.setMode(mode); instance.renderStill();
        if (!media.paused) instance.start();
        setReady(true);
      } catch (reason) {
        renderer.current?.destroy(); renderer.current = undefined;
        if (!disposed) setError(reason instanceof Error ? reason.message : uiI18n.t('landingEnhancers.previewFailed'));
      } finally { starting = false; }
    };
    const renderPaused = () => { if (renderer.current) { try { renderer.current.renderStill(); } catch { setReady(false); } } };
    media.addEventListener('loadeddata', prepare);
    media.addEventListener('seeked', renderPaused);
    void prepare();
    return () => {
      disposed = true; media.removeEventListener('loadeddata', prepare); media.removeEventListener('seeked', renderPaused);
      renderer.current?.destroy(); renderer.current = undefined;
    };
  }, [enabled, mode]);

  useEffect(() => {
    const element = stage.current;
    const media = video.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) media?.pause(); }, { threshold: .1 });
    observer.observe(element);
    return () => { observer.disconnect(); media?.pause(); };
  }, []);

  const togglePlayback = () => {
    const media = video.current;
    if (!media) return;
    if (!media.paused) media.pause();
    else { if (media.ended) media.currentTime = 0; void media.play().catch(() => setError(uiI18n.t('landingEnhancers.videoUnavailable'))); }
  };
  return <div>
    <div ref={stage} className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
      <video ref={video} src={animeDemo} poster={animePoster} playsInline muted preload="metadata" aria-label={uiI18n.t('landingEnhancers.animeVideo')}
        className="block aspect-video w-full object-contain" onPlay={() => { setPlaying(true); renderer.current?.start(); }} onPause={() => { setPlaying(false); renderer.current?.stop(); }} onEnded={() => setPlaying(false)} />
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={{ opacity: ready && enabled ? 1 : 0, clipPath: `inset(0 0 0 ${split}%)` }} />
      {ready && enabled && <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${split}%` }} />}
      {!playing && <button type="button" onClick={togglePlayback} aria-label={uiI18n.t('landingEnhancers.play')} className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white"><Play aria-hidden className="size-5" /></button>}
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs text-white/80">{uiI18n.t('landingEnhancers.original')}</span>
      {ready && enabled && <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs text-white/80">Anime4K</span>}
    </div>
    {ready && enabled && <label className="mt-4 block"><span className="sr-only">{uiI18n.t('landingEnhancers.compareVideo')}</span><input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} className="w-full accent-primary" /></label>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={togglePlayback} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black">{playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}{uiI18n.t(playing ? 'landingEnhancers.pause' : 'landingEnhancers.play')}</button>
      <button type="button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white/80">{uiI18n.t(enabled ? 'landingEnhancers.enhancerOn' : 'landingEnhancers.enhancerOff')}</button>
      <div role="group" aria-label={uiI18n.t('landingEnhancers.quality')} className="flex gap-1">{(['light', 'standard', 'high'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-10 rounded-lg px-3 text-xs font-medium ${mode === value ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'}`}>{uiI18n.t(`landingEnhancers.${value}Quality`)}</button>)}</div>
    </div>
    {error && <p role="status" className="mt-3 text-xs leading-relaxed text-white/70">{error}</p>}
  </div>;
}

function EnhancementSample({ kind, sample }: { kind: 'anime' | 'manga'; sample: string }) {
  const [source, setSource] = useState(sample);
  const [enhanced, setEnhanced] = useState(kind === 'manga' ? mangaEnhanced : '');
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>();
  const uploaded = useRef<string>();
  const result = useRef<string>();
  const input = useRef<HTMLInputElement>(null);
  const desktop = typeof window !== 'undefined' && !!window.electron?.upscaler;
  useEffect(() => () => {
    controller.current?.abort();
    if (uploaded.current) URL.revokeObjectURL(uploaded.current);
    if (result.current) URL.revokeObjectURL(result.current);
  }, []);

  const enhance = async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try {
      if (kind === 'manga') {
        const status = await window.electron?.upscaler?.status();
        if (!status?.manga) throw new Error(uiI18n.t('landingEnhancers.modelRequired'));
      }
      const original = await fetch(source, { signal: request.signal }).then(response => response.blob());
      const output = await withUpscaleSlot(100, () => upscaleImage(original, kind === 'anime' ? 'anime4k' : 'manga', 'standard', 2, request.signal, { preview: true, quality: 'balanced' }));
      if (request.signal.aborted) return;
      if (result.current) URL.revokeObjectURL(result.current);
      result.current = URL.createObjectURL(output); setEnhanced(result.current); setSplit(50);
    } catch (reason) {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : uiI18n.t('landingEnhancers.previewFailed'));
    } finally { if (!request.signal.aborted) setBusy(false); }
  };

  return <div className="enhancer-sample">
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black" aria-busy={busy}>
      <img src={source} alt={uiI18n.t(`landingEnhancers.${kind}Sample`)} className="block aspect-[4/3] w-full object-contain" decoding="async" />
      {enhanced && <img src={enhanced} alt={uiI18n.t('landingEnhancers.enhanced')} className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />}
      {enhanced && <div aria-hidden className="absolute inset-y-0 w-px bg-white" style={{ left: `${split}%` }} />}
      <span className="absolute left-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs text-white/80">{uiI18n.t('landingEnhancers.original')}</span>
      {enhanced && <span className="absolute right-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs text-white/80">{uiI18n.t('landingEnhancers.enhanced')}</span>}
    </div>
    {enhanced && <label className="mt-4 block"><span className="sr-only">{uiI18n.t('landingEnhancers.compare')}</span><input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} className="w-full accent-primary" /></label>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {kind === 'anime' || desktop ? <button type="button" disabled={busy} onClick={() => void enhance()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-50">
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <SlidersHorizontal aria-hidden className="size-4" />}
        {uiI18n.t(busy ? 'landingEnhancers.processing' : enhanced ? 'landingEnhancers.refresh' : 'landingEnhancers.trySample')}
      </button> : <Link to="/download" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black">{uiI18n.t('landingEnhancers.desktopPreview')}<ArrowRight aria-hidden className="size-4" /></Link>}
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 rounded-lg px-3 text-sm font-medium text-white/70 hover:bg-white/5 disabled:opacity-50">{uiI18n.t('landingEnhancers.chooseImage')}</button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={uiI18n.t('landingEnhancers.chooseImage')} className="sr-only" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) { setError(uiI18n.t('landingEnhancers.imageTooLarge')); return; }
        controller.current?.abort();
        if (uploaded.current) URL.revokeObjectURL(uploaded.current);
        if (result.current) { URL.revokeObjectURL(result.current); result.current = undefined; }
        uploaded.current = URL.createObjectURL(file); setSource(uploaded.current); setEnhanced(''); setError(''); event.target.value = '';
      }} />
    </div>
    {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-white/70">{error}</p>}
  </div>;
}

export function Enhancers() {
  useUiTranslation();
  return <section data-landing-enhancers className="border-t border-white/10" aria-labelledby="enhancers-heading">
    <div className="mb-8 max-w-3xl"><p className="mb-4 text-xs font-medium text-white/65">{uiI18n.t('landingEnhancers.eyebrow')}</p>
      <h2 id="enhancers-heading" className="font-display text-white">{uiI18n.t('landingEnhancers.title')}</h2>
      <p className="mt-5 text-base leading-relaxed text-white/70">{uiI18n.t('landingEnhancers.description')}</p>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      {(['anime', 'manga'] as const).map(kind => <article key={kind} className="rounded-2xl border border-white/10 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">{kind === 'anime' ? <Film aria-hidden className="size-[18px] text-white/60" /> : <BookOpen aria-hidden className="size-[18px] text-white/60" />}
          <h3 className="font-display text-2xl font-medium text-white">{uiI18n.t(`landingEnhancers.${kind}Title`)}</h3>
        </div>
        <p className="mb-5 min-h-12 text-sm leading-relaxed text-white/70">{uiI18n.t(`landingEnhancers.${kind}Description`)}</p>
        {kind === 'anime' ? <AnimeVideoSample /> : <EnhancementSample kind={kind} sample={mangaOriginal} />}
        <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/60">{uiI18n.t(`landingEnhancers.${kind}Note`)}</p>
      </article>)}
    </div>
  </section>;
}
