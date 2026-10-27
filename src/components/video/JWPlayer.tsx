import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { useVideoSettings, type VideoSettings } from '@/hooks/media/useVideoSettings';
import { selectPreferredSource } from '@/lib/video/preferredSource';
import { getProxiedSubtitleUrl } from '@/lib/api';
import type { VideoPlayerProps, VideoPlayerExtendedProps } from './VideoPlayer.types';

interface JWInstance {
  setup(config: Record<string, unknown>): JWInstance;
  on(event: string, callback: (event: any) => void): JWInstance;
  seek(time: number): void;
  setPlaybackRate(rate: number): void;
  getPosition(): number;
  getDuration(): number;
  remove(): void;
}
type JWFactory = (element: HTMLElement) => JWInstance;
const libraries = new Map<string, Promise<JWFactory>>();
function loadLibrary(id: string): Promise<JWFactory> {
  if (!/^[a-zA-Z0-9]{8}$/.test(id)) return Promise.reject(new Error('Add your JW Player library ID in Settings → Video Player.'));
  const existing = libraries.get(id);
  if (existing) return existing;
  const promise = new Promise<JWFactory>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); libraries.delete(id); reject(new Error('JW Player could not load. Check your connection and library ID.')); };
    const timer = window.setTimeout(fail, 15000);
    script.src = `https://cdn.jwplayer.com/libraries/${id}.js`;
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      const factory = (window as Window & { jwplayer?: JWFactory }).jwplayer;
      if (factory) resolve(factory); else fail();
    };
    document.head.appendChild(script);
  });
  libraries.set(id, promise);
  return promise;
}

type Props = VideoPlayerProps & VideoPlayerExtendedProps & { torrentUrl?: string; sourceType?: string };

/** Advanced/native streams and room synchronization retain the built-in engine. */
export function OptionalJWPlayer({ children, ...props }: Props & { children: ReactNode }) {
  const { settings } = useVideoSettings();
  const [fallback, setFallback] = useState(false);
  const position = useRef(props.initialSeekSeconds || 0);
  const compatible = props.sources.length > 0 && props.sources.every(source =>
    /^(https?:|blob:)/i.test(source.url) && source.sourceType !== 'torrent' && !Object.keys(source.headers || {}).length)
    && !Object.keys(props.headers || {}).length && !props.externalRef && !props.isTimelineLocked && !props.hideTimelineUi
    && !props.torrentSessionId && !props.torrentStats && !props.torrentUrl && props.sourceType !== 'torrent' && !props.isOffline && !props.isLoading;
  if (settings.playerEngine !== 'jwplayer' || fallback || !compatible) return <>{fallback && isValidElement<{ initialSeekSeconds?: number }>(children)
    ? cloneElement(children, { initialSeekSeconds: position.current }) : children}</>;
  return <JWPlayer {...props} settings={settings} onProgressUpdate={(time, ...rest) => {
    position.current = time;
    props.onProgressUpdate?.(time, ...rest);
  }} onFallback={() => setFallback(true)} />;
}

function JWPlayer(props: Props & { settings: VideoSettings; onFallback: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const source = selectPreferredSource(props.sources, props.settings.defaultQuality);
  const { jwPlayerLibraryId, autoplay, playbackSpeed, volume, loopVideo, subtitleLanguage } = props.settings;
  useEffect(() => {
    let disposed = false;
    let player: JWInstance | undefined;
    setError('');
    setLoading(true);
    const mount = document.createElement('div');
    host.current?.appendChild(mount);
    void loadLibrary(jwPlayerLibraryId).then(factory => {
      if (disposed || !source) return;
      player = factory(mount);
      player.setup({
        width: '100%', aspectratio: '16:9', controls: true, autostart: autoplay,
        volume: volume * 100, repeat: loopVideo, playbackRateControls: [0.5, 0.75, 1, 1.25, 1.5, 2],
        playlist: [{ sources: [{ file: source.url, ...(source.isM3U8 ? { type: 'hls' } : {}) }],
          image: props.poster, title: props.animeName,
          tracks: (props.subtitles || []).map(track => ({ file: getProxiedSubtitleUrl(track.url), label: track.label || track.lang, kind: 'captions', default: subtitleLanguage !== 'off' && track.lang.toLowerCase() === subtitleLanguage.toLowerCase() })) }],
      });
      player.on('ready', () => {
        if (!disposed) setLoading(false);
        player?.setPlaybackRate(playbackSpeed);
        if (props.initialSeekSeconds && props.initialSeekSeconds > 0) player?.seek(props.initialSeekSeconds);
      });
      player.on('time', event => callbacks.current.onProgressUpdate?.(event.position, event.duration));
      player.on('play', () => callbacks.current.onPlay?.());
      player.on('pause', () => {
        callbacks.current.onPause?.();
        if (player) callbacks.current.onProgressUpdate?.(player.getPosition(), player.getDuration(), false, true);
      });
      player.on('complete', () => {
        if (player) callbacks.current.onProgressUpdate?.(player.getDuration(), player.getDuration(), true, true);
        callbacks.current.onEpisodeEnd?.();
      });
      const fail = (event: { message?: string }) => { if (!disposed) setError(event.message || 'JW Player could not play this source.'); };
      player.on('setupError', fail).on('error', fail);
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'JW Player could not load.'); });
    return () => {
      disposed = true;
      if (player) {
        try { props.onProgressUpdate?.(player.getPosition(), player.getDuration(), false, true); } catch { /* Setup may not have completed. */ }
        player.remove();
      }
      mount.remove();
    };
    // Source changes own a player lifecycle; callback changes must not restart playback.
  }, [source?.url, source?.isM3U8, jwPlayerLibraryId]);
  return <div className="relative overflow-hidden rounded-xl bg-black text-white">
    <div ref={host} className="aspect-video" />
    {loading && !error && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-sm text-white/80">Loading JW Player…</div>}
    {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/95 p-6 text-center">
      <p className="max-w-md text-sm">{error}</p>
      <button type="button" onClick={props.onFallback} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground focus-visible:outline focus-visible:outline-2">Use built-in player</button>
    </div>}
  </div>;
}
