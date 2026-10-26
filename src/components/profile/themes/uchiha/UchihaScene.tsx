import { isNative } from '@/lib/platform/platform';
import { useEffect, useRef, useState } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

export const UCHIHA_POSTER = '/assets/profile-themes/uchiha/itachi-rain-poster.webp';
const MEDIA_ROOT = '/assets/profile-themes/uchiha/';

/** Poster first. Decode only while visible; never download video in reduced/data-saving mode. */
export function UchihaScene({ compact = false, paused = false }: { compact?: boolean; paused?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduce = useMotionPreference();
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [source, setSource] = useState<string>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    if (host.current) observer.observe(host.current);
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (source || reduce || saveData || !visible || paused || hidden) return;
    const av1 = video.current?.canPlayType('video/mp4; codecs="av01.0.12M.08"');
    const file = compact ? 'itachi-rain-widget.mp4'
      : window.innerWidth < 768 ? 'itachi-rain-mobile.mp4'
      : !isNative() && window.innerWidth >= 1600 && av1 ? 'itachi-rain-4k.mp4' : 'itachi-rain.mp4';
    setSource(MEDIA_ROOT + file);
  }, [compact, hidden, paused, reduce, source, visible]);

  useEffect(() => {
    const element = video.current;
    if (!element || !source) return;
    if (reduce || paused || hidden || !visible || failed) element.pause();
    else void element.play().catch(() => { /* The poster remains usable when autoplay is unavailable. */ });
    return () => element.pause();
  }, [failed, hidden, paused, reduce, source, visible]);

  return <div ref={host} className={`uchiha-scene${compact ? ' uchiha-scene-compact' : ''}`} data-ready={ready && !failed && !reduce || undefined} aria-hidden="true">
    <img className="uchiha-scene-poster" src={UCHIHA_POSTER} alt="" decoding="async" fetchPriority={compact ? 'auto' : 'high'} />
    <video ref={video} src={source} poster={UCHIHA_POSTER} muted loop playsInline preload={source ? 'auto' : 'none'} disablePictureInPicture tabIndex={-1} onLoadedData={() => setReady(true)} onError={() => {
      if (source?.endsWith('itachi-rain-4k.mp4')) { setReady(false); setSource(MEDIA_ROOT + 'itachi-rain.mp4'); }
      else setFailed(true);
    }} />
  </div>;
}
