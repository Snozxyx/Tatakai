import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { closeNativePlayer, onNativePlayerEvent, openNativePlayer } from '@/core/player/mobile/nativePlayerBridge';
import { isMobileProxyUrl, normalizeMobileHeaders, resolveMobileProxy } from '@/core/extensions/mobile/mobileProxy';
import { useVideoSettings } from '@/hooks/media/useVideoSettings';

type Subtitle = {
  lang: string;
  url: string;
  label?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
};

export type NativeTorrentStats = {
  progress?: number;
  seeders?: number;
  numPeers?: number;
  downloadSpeed?: number;
  name?: string;
};

type Props = {
  url: string;
  title?: string;
  poster?: string;
  subtitles?: Subtitle[];
  preferredAudioLanguage?: string;
  initialSeekSeconds?: number;
  introWindow?: { start: number; end: number } | null;
  outroWindow?: { start: number; end: number } | null;
  torrentStats?: NativeTorrentStats | null;
  onProgressUpdate?: (positionSeconds: number, durationSeconds: number, completed?: boolean) => void;
  onEpisodeEnd?: () => void;
  onBack?: () => void;
  onError?: (message?: string) => void;
};

function subtitleMime(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.vtt')) return 'text/vtt';
  if (clean.endsWith('.srt')) return 'application/x-subrip';
  if (clean.endsWith('.ass') || clean.endsWith('.ssa')) return 'text/x-ssa';
  // Unknown extension (proxied URLs, query-signed links): default to WebVTT so
  // the native builder always has the required MIME type. Matches
  // PlayerActivity.inferSubtitleMime.
  return 'text/vtt';
}

function nativeLanguage(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') return '';
  if (normalized === 'off') return '';
  if (normalized === 'english' || normalized.startsWith('eng')) return 'en';
  if (normalized === 'japanese' || normalized.startsWith('jpn')) return 'ja';
  if (normalized === 'hindi' || normalized.startsWith('hin')) return 'hi';
  if (normalized === 'spanish' || normalized.startsWith('spa')) return 'es';
  if (normalized === 'french' || normalized.startsWith('fre') || normalized.startsWith('fra')) return 'fr';
  return normalized.slice(0, 2);
}

function formatRate(bytesPerSecond?: number): string {
  const value = Number(bytesPerSecond || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 KB/s';
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB/s`;
  return `${(kb / 1024).toFixed(kb / 1024 >= 100 ? 0 : 1)} MB/s`;
}

/**
 * Hands an Android torrent stream to Media3. The visible React surface is only
 * a handoff/status state: the actual video is a full-screen native Activity,
 * which is necessary for reliable MKV/HEVC playback and embedded subtitle
 * support.
 */
export function NativeTorrentPlayer({
  url,
  title,
  poster,
  subtitles = [],
  preferredAudioLanguage,
  initialSeekSeconds,
  introWindow,
  outroWindow,
  torrentStats,
  onProgressUpdate,
  onEpisodeEnd,
  onBack,
  onError,
}: Props) {
  const { settings } = useVideoSettings();
  const openedUrlRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const [status, setStatus] = useState<'opening' | 'playing' | 'closed' | 'error'>('opening');
  const [message, setMessage] = useState('Opening native torrent player…');

  // Callback refs: WatchPage passes fresh closures every render
  // (handleEpisodeEnd is not memoized). Depending on them directly would tear
  // down and rebuild the native subscription on every render; indirection
  // keeps one subscription per URL.
  const progressRef = useRef(onProgressUpdate);
  useEffect(() => { progressRef.current = onProgressUpdate; }, [onProgressUpdate]);
  const endedRef = useRef(onEpisodeEnd);
  useEffect(() => { endedRef.current = onEpisodeEnd; }, [onEpisodeEnd]);
  const backRef = useRef(onBack);
  useEffect(() => { backRef.current = onBack; }, [onBack]);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  const nativeSubtitles = useMemo(() => subtitles
    .filter((track) => Boolean(track?.url))
    .map((track) => {
      const proxyEntry = isMobileProxyUrl(track.url) ? resolveMobileProxy(track.url) : null;
      const url = proxyEntry?.url || track.originalUrl || track.url;
      const headers = {
        ...normalizeMobileHeaders(track.headers),
        ...normalizeMobileHeaders(proxyEntry?.headers),
      };
      return {
        url,
        lang: track.lang,
        label: track.label,
        mime: subtitleMime(url),
        headers,
      };
    }),
    [subtitles]);
  const nativeRequestHeaders = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const track of nativeSubtitles) Object.assign(merged, track.headers || {});
    return merged;
  }, [nativeSubtitles]);
  const nativePreferences = useMemo(() => ({
    preferredAudioLanguage: nativeLanguage(preferredAudioLanguage),
    preferredSubtitleLanguage: nativeLanguage(
      settings.subtitleLanguage === 'auto' ? 'english' : settings.subtitleLanguage,
    ),
    subtitlesEnabled: settings.subtitleLanguage !== 'off',
  }), [preferredAudioLanguage, settings.subtitleLanguage]);
  // Read via ref in the open effect: subtitle arrays get new identities when
  // upstream metadata re-resolves, and reopening the native Activity for that
  // would kill mid-playback video. One open per URL; retry picks up latest.
  const subtitlesRef = useRef(nativeSubtitles);
  useEffect(() => { subtitlesRef.current = nativeSubtitles; }, [nativeSubtitles]);
  const titleRef = useRef(title);
  useEffect(() => { titleRef.current = title; }, [title]);

  // Window refs: intro/outro objects are re-created upstream; only their
  // numeric bounds matter for the handoff, so the open effect must not
  // re-fire on identity changes.
  const introKey = introWindow ? `${introWindow.start}:${introWindow.end}` : '';
  const outroKey = outroWindow ? `${outroWindow.start}:${outroWindow.end}` : '';
  const windowsRef = useRef({ intro: introWindow ?? null, outro: outroWindow ?? null });
  useEffect(() => {
    windowsRef.current = { intro: introWindow ?? null, outro: outroWindow ?? null };
  }, [introKey, outroKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPositionRef = useRef(Math.max(0, Number(initialSeekSeconds || 0) * 1000));
  useEffect(() => {
    // Only the mount-time resume position is used for the handoff; later
    // progress reports must not re-seek the native player.
    if (openedUrlRef.current == null) {
      startPositionRef.current = Math.max(0, Number(initialSeekSeconds || 0) * 1000);
    }
  }, [initialSeekSeconds]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    completedRef.current = false;
    setStatus('opening');
    setMessage('Opening native torrent player…');

    unsubscribe = onNativePlayerEvent((event: any) => {
      if (cancelled) return;
      const position = Number(event?.positionMs || 0) / 1000;
      const duration = Number(event?.durationMs || 0) / 1000;
      if (event?.type === 'playerProgress' || event?.type === 'playerClosed') {
        progressRef.current?.(position, duration, Boolean(event?.completed));
      }
      if (event?.type === 'playerEnded' && !completedRef.current) {
        completedRef.current = true;
        progressRef.current?.(position, duration, true);
        endedRef.current?.();
      }
      if (event?.type === 'playerClosed') {
        setStatus('closed');
        // Hand control back to the watch page (resume/up-next already saved
        // via the progress callback above).
        backRef.current?.();
      }
      if (event?.type === 'playerError') {
        setStatus('error');
        const text = String(event?.message || 'Unable to decode this torrent file on this device.');
        setMessage(text);
        errorRef.current?.(text);
      }
    });

    // One open per URL. Title/subtitles/windows flow through refs so their
    // identity churn never restarts playback.
    openedUrlRef.current = url;
    const windows = windowsRef.current;
    void openNativePlayer({
      url,
      title: titleRef.current,
      startPositionMs: startPositionRef.current,
      intro: windows.intro,
      outro: windows.outro,
      subtitles: subtitlesRef.current,
      headers: nativeRequestHeaders,
      ...nativePreferences,
    }).then((result: any) => {
      if (cancelled) return;
      if (!result?.success) {
        openedUrlRef.current = null;
        setStatus('error');
        const text = String(result?.error || 'Could not open the native torrent player.');
        setMessage(text);
        errorRef.current?.(text);
        return;
      }
      setStatus('playing');
      setMessage('Playing in the native player…');
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      // Tear down the native Activity when this screen unmounts or the URL
      // changes (user picked another source, episode changed, navigated
      // away). Without this the Activity stayed alive on the back stack with
      // audio playing.
      if (openedUrlRef.current != null) {
        openedUrlRef.current = null;
        void closeNativePlayer().catch(() => { /* best effort */ });
      }
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    openedUrlRef.current = null;
    completedRef.current = false;
    setStatus('opening');
    setMessage('Opening native torrent player…');
    const windows = windowsRef.current;
    void openNativePlayer({
      url,
      title,
      startPositionMs: startPositionRef.current,
      intro: windows.intro,
      outro: windows.outro,
      subtitles: nativeSubtitles,
      headers: nativeRequestHeaders,
      ...nativePreferences,
    }).then((result: any) => {
      if (!result?.success) {
        openedUrlRef.current = null;
        setStatus('error');
        const text = String(result?.error || 'Could not open the native torrent player.');
        setMessage(text);
        errorRef.current?.(text);
        return;
      }
      openedUrlRef.current = url;
      setStatus('playing');
      setMessage('Playing in the native player…');
    });
  };

  const progressPercent = (() => {
    const raw = Number(torrentStats?.progress ?? 0);
    if (!Number.isFinite(raw)) return 0;
    // Native reports 0..1, the WebTorrent path reports 0..100 — accept both.
    const normalized = raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, normalized));
  })();

  return (
    <div className="relative flex w-full aspect-video items-center justify-center overflow-hidden bg-black text-white">
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 blur-[2px]"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60" />
      <div className="relative flex max-w-md flex-col items-center px-6 text-center">
        {status === 'error' ? (
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
        ) : (
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
        )}
        <p className="text-sm font-medium text-white/90">
          {status === 'closed' ? 'Native player closed.' : status === 'playing' ? 'Playing in the native player…' : message}
        </p>
        {status === 'playing' && (
          <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-white/50">
            Subtitles &amp; alternate audio (incl. embedded MKV tracks) are in the player&apos;s subtitle / settings menu.
          </p>
        )}
        {status !== 'error' && (
          <p className="mt-1 text-xs text-white/60">
            {progressPercent.toFixed(0)}%{Number(torrentStats?.seeders) > 0 ? ` • ${torrentStats?.seeders} seeders` : ''}
            {Number(torrentStats?.numPeers) > 0 ? ` • ${torrentStats?.numPeers} peers` : ''}
            {Number(torrentStats?.downloadSpeed) > 0 ? ` • ${formatRate(torrentStats?.downloadSpeed)}` : ''}
          </p>
        )}
        {status !== 'error' && progressPercent > 0 && (
          <div className="mt-3 h-1 w-48 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
        {(status === 'error' || status === 'closed') && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={retry}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              {status === 'error' ? 'Retry' : 'Reopen player'}
            </button>
            {onBack && (
              <button
                onClick={() => backRef.current?.()}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
