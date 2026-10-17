import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import { useTVAppearance } from "@/core/tv/appearance";
import { TV_WALLPAPERS, validTVWallpaper, wallpaperTheme } from "@/core/tv/wallpapers";
import { shouldAnimateWallpaper } from "@/core/tv/wallpaperPlayback";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
export function TVVideoWallpaper({ paused = false }: { paused?: boolean }) {
  const { appearance, reduced } = useTVAppearance();
  const ref = useRef<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    const previous = ref.current;
    if (previous && previous !== video) {
      previous.pause();
      previous.removeAttribute('src');
      previous.load();
    }
    ref.current = video;
  }, []);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [foreground, setForeground] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const activePreviews = useRef(new Set<string>());
  const [failed, setFailed] = useState('');
  const preset = TV_WALLPAPERS.find(item => item.src === appearance.wallpaper) || TV_WALLPAPERS[0];
  useEffect(() => {
    for (const [key, value] of Object.entries(wallpaperTheme(preset.color))) document.documentElement.style.setProperty(key, value);
  }, [preset]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    const media = (event: Event) => {
      const { id, active } = (event as CustomEvent<{ id: string; active: boolean }>).detail;
      if (active) activePreviews.current.add(id); else activePreviews.current.delete(id);
      setPreviewing(activePreviews.current.size > 0);
    };
    document.addEventListener("visibilitychange", update);
    window.addEventListener('tatakai-tv-preview-playback', media);
    let disposed = false;
    let handle: { remove(): Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', state => setForeground(state.isActive)).then(value => {
      if (disposed) void value.remove(); else handle = value;
    }).catch(() => {});
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener('tatakai-tv-preview-playback', media);
      void handle?.remove();
    };
  }, []);
  const still = !shouldAnimateWallpaper({ enabled: appearance.videoWallpaper, reduced, visible, foreground, paused, previewing }) || failed === appearance.wallpaper || !validTVWallpaper(appearance.wallpaper);
  return (
    <>
      {still ? <img className="tv-video-wallpaper" src={preset.poster} alt="" aria-hidden="true" /> : <video
        key={appearance.wallpaper}
        ref={attachVideo}
        className="tv-video-wallpaper"
        src={appearance.wallpaper}
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        poster={preset.poster}
        onLoadedData={() => { void ref.current?.play().catch(() => {}); }}
        onError={() => setFailed(appearance.wallpaper)}
        aria-hidden="true"
        tabIndex={-1}
      />}
      <div className="tv-wallpaper-overlay" aria-hidden="true" />
    </>
  );
}
export function TVTrailerPreview({
  anilistId,
  title,
}: {
  anilistId?: number;
  title: string;
}) {
  const { appearance, reduced } = useTVAppearance();
  const previewId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const preview = useHoverPreview({
    anilistId,
    title,
    enabled: visible && appearance.previews && !reduced,
  });
  useEffect(() => {
    const notify = (active: boolean) => window.dispatchEvent(new CustomEvent('tatakai-tv-preview-playback', { detail: { id: previewId, active } }));
    notify(preview.isActive);
    return () => { notify(false); };
  }, [previewId, preview.isActive]);
  const handlers = useRef(preview);
  handlers.current = preview;
  useEffect(() => {
    const timer = setTimeout(() => handlers.current.onEnter(), 1500);
    return () => {
      clearTimeout(timer);
      handlers.current.onLeave();
    };
  }, [anilistId, title]);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="tv-trailer-layer"
      aria-hidden="true"
      style={{ opacity: preview.isActive ? 1 : 0 }}
    >
      <video
        ref={preview.videoRef}
        muted
        loop
        playsInline
        preload="none"
        tabIndex={-1}
        onError={preview.onError}
      />
    </div>
  );
}
