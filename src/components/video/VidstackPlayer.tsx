import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDASHProvider, isHLSProvider, isVideoProvider, MediaPlayer, MediaProvider, Poster, Track, type MediaErrorDetail, type MediaPlayerInstance, type MediaProviderAdapter } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getProxiedImageUrl, getProxiedSubtitleUrl } from '@/lib/api';
import { getProfileKnobs } from '@/lib/memoryProfile';
import { getEffectiveMemoryProfile, shouldAutoplayVideo } from '@/lib/mobile/dataSaver';
import { buildVidstackPlaybackUrls, getVidstackSourceType } from '@/lib/video/vidstackSource';
import { selectPreferredSource } from '@/lib/video/preferredSource';
import { registerGlobalVideo, updateGlobalVideoTime } from '@/core/player/global-video-ref';
import { usePlaybackCoordinator } from '@/core/player/usePlaybackCoordinator';
import type { VideoSettings } from '@/hooks/media/useVideoSettings';
import type { OptionalVidstackProps } from './OptionalVidstackPlayer';
import { normalizeTrackLanguage } from './hooks/useSubtitleManager';
import { useSleepTimer } from './hooks/usePlayerEnhancements';
import { useDesktopPlayerFullscreen } from './hooks/useDesktopPlayerFullscreen';
import { VideoSettingsPanel } from './VideoSettingsPanel';
import { UpNextOverlay } from './overlays/UpNextOverlay';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import './vidstack-player.css';

export default function VidstackPlayer(props: OptionalVidstackProps & { settings: VideoSettings; onFallback: () => void }) {
  const { t } = useTranslation();
  const { onEpisodeEnd } = props;
  const player = useRef<MediaPlayerInstance>(null);
  const video = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const fullscreenActive = useRef(false);
  const [isDesktopFullscreen, setIsDesktopFullscreen] = useState(false);
  const onDesktopFullscreenChange = useCallback((enabled: boolean) => {
    fullscreenActive.current = enabled;
    setIsDesktopFullscreen(enabled);
    // Feed the native window state back into Vidstack's controls and menus.
    player.current?.dispatch('fullscreen-change', { detail: enabled });
  }, []);
  const desktopFullscreen = useDesktopPlayerFullscreen(container, onDesktopFullscreenChange);
  const fullscreenAdapter = useMemo(() => ({
    get supported() { return desktopFullscreen.isDesktop; },
    get active() { return fullscreenActive.current; },
    enter: desktopFullscreen.enter,
    exit: desktopFullscreen.exit,
  }), [desktopFullscreen.isDesktop, desktopFullscreen.enter, desktopFullscreen.exit]);
  useEffect(() => {
    if (!desktopFullscreen.isDesktop || !player.current?.el) return;
    const element = player.current.el;
    const syncFullscreen = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail !== 'boolean' || detail === fullscreenActive.current) return;
      // Electron's browser event can disagree with the OS window transition.
      // Keep Vidstack's buttons and menus on the native player state.
      event.stopImmediatePropagation();
      player.current?.dispatch('fullscreen-change', { detail: fullscreenActive.current });
    };
    element.addEventListener('fullscreen-change', syncFullscreen, true);
    return () => element.removeEventListener('fullscreen-change', syncFullscreen, true);
  }, [desktopFullscreen.isDesktop]);
  const source = selectPreferredSource(props.sources, props.settings.defaultQuality)!;
  const urls = useMemo(() => buildVidstackPlaybackUrls(source, props.headers), [source, props.headers]);
  const [candidate, setCandidate] = useState(0);
  const url = urls[candidate] || urls[0];
  const mime = getVidstackSourceType(source);
  const mediaSource = useMemo(() => ({ src: url, type: mime }), [url, mime]);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const resumePosition = useRef(props.initialSeekSeconds || 0);
  const pendingSeek = useRef(true);
  const episodeKey = `${props.animeId || ''}|${props.episodeId || props.episodeNumber || ''}`;
  const playbackKey = useRef({ episodeKey, url });
  // Vidstack resets media time as soon as src changes, before passive effects.
  // Capture the old position and stop accepting those reset events first.
  if (playbackKey.current.episodeKey !== episodeKey) {
    resumePosition.current = props.initialSeekSeconds || 0;
    pendingSeek.current = true;
  } else if (playbackKey.current.url !== url) {
    if (!pendingSeek.current) resumePosition.current = player.current?.currentTime || resumePosition.current;
    pendingSeek.current = true;
  }
  playbackKey.current = { episodeKey, url };
  const { report } = usePlaybackCoordinator({
    mediaId: props.animeId, episodeId: props.episodeId || String(props.episodeNumber || ''),
    url: source.url, initialPosition: resumePosition.current, sink: props.onProgressUpdate,
  });
  useSleepTimer(video, props.settings.sleepTimer);

  useEffect(() => {
    resumePosition.current = props.initialSeekSeconds || 0;
    pendingSeek.current = true;
    setCurrentTime(resumePosition.current);
  }, [episodeKey, props.initialSeekSeconds]);
  const urlsKey = urls.join('|');
  useEffect(() => { setCandidate(0); }, [urlsKey]);
  useEffect(() => {
    setError(null);
    setUpNextCountdown(null);
  }, [url, episodeKey]);
  useEffect(() => () => registerGlobalVideo(null), []);

  const onProviderChange = useCallback((provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      // Use the bundled HLS runtime and the same buffer policy as Tatakai.
      provider.library = Hls;
      provider.config = {
        ...getProfileKnobs(getEffectiveMemoryProfile()).hls,
        enableWorker: true, lowLatencyMode: !!props.isLive, startFragPrefetch: true,
        startLevel: 0, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 1,
      };
    }
    if (isDASHProvider(provider)) provider.library = () => import('dashjs');
    if (desktopFullscreen.isDesktop && (isVideoProvider(provider) || isHLSProvider(provider) || isDASHProvider(provider))) {
      provider.fullscreen = fullscreenAdapter;
    }
    video.current = isVideoProvider(provider) || isHLSProvider(provider) || isDASHProvider(provider) ? provider.video : null;
    registerGlobalVideo(video.current, window.location.pathname, { animeName: props.animeName, animePoster: props.poster });
  }, [props.isLive, props.animeName, props.poster, desktopFullscreen.isDesktop, fullscreenAdapter]);

  const onCanPlay = () => {
    if (!player.current) return;
    setError(null);
    if (pendingSeek.current) {
      const duration = player.current.duration;
      if (resumePosition.current > 0 && !props.isLive) {
        player.current.currentTime = Number.isFinite(duration) && duration > 0
          ? Math.min(resumePosition.current, Math.max(0, duration - 0.1)) : resumePosition.current;
      }
      pendingSeek.current = false;
    }
  };
  const onError = (detail: MediaErrorDetail) => {
    if (candidate + 1 < urls.length) { setCandidate(index => index + 1); return; }
    setError(detail.message || 'Video could not play this source.');
    props.onError?.({ statusCode: detail.code, reason: 'vidstack-playback-error' });
  };
  const onEnded = () => {
    const duration = player.current?.duration || resumePosition.current;
    report(duration, duration, true, true);
    if (props.settings.autoNextEpisode && props.settings.sleepTimer !== 'end-of-episode' && props.onEpisodeEnd) {
      setUpNextCountdown(Math.max(1, props.settings.autoNextCountdownSeconds));
    }
  };
  useEffect(() => {
    if (upNextCountdown === null) return;
    if (upNextCountdown <= 0) { setUpNextCountdown(null); onEpisodeEnd?.(); return; }
    const timer = window.setTimeout(() => setUpNextCountdown(value => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, onEpisodeEnd]);

  const activeSkip = props.introWindow && currentTime >= props.introWindow.start && currentTime < props.introWindow.end
    ? { end: props.introWindow.end, label: t('player.skipIntro') }
    : props.outroWindow && currentTime >= props.outroWindow.start && currentTime < props.outroWindow.end
      ? { end: props.outroWindow.end, label: t('player.skipOutro') } : null;
  useEffect(() => {
    if (props.settings.autoSkipIntro && props.introWindow && currentTime >= props.introWindow.start && currentTime < props.introWindow.end && player.current && !pendingSeek.current) {
      player.current.currentTime = props.introWindow.end;
    }
  }, [currentTime, props.introWindow, props.settings.autoSkipIntro]);

  const subtitlePreference = normalizeTrackLanguage(props.settings.subtitleLanguage);
  const subtitleIndex = props.settings.subtitleLanguage === 'off' ? -1
    : (props.subtitles || []).findIndex(subtitle => normalizeTrackLanguage(subtitle.lang) === subtitlePreference);
  const poster = props.poster ? getProxiedImageUrl(props.poster) : undefined;
  return <div ref={container} className="vidstack-player-container overflow-hidden rounded-xl bg-black text-white">
    <MediaPlayer ref={player} src={mediaSource} title={props.animeName || props.episodeTitle} poster={poster}
      viewType="video" streamType={props.isLive ? 'live' : 'on-demand'} aspectRatio="16/9"
      autoPlay={shouldAutoplayVideo(props.settings.autoplay)} volume={props.settings.volume}
      playbackRate={props.settings.playbackSpeed} loop={props.settings.loopVideo} playsInline load="eager"
      style={{ '--media-brand': 'hsl(var(--primary))', '--media-cue-color': props.settings.subtitleColor,
        '--media-cue-bg': props.settings.subtitleBackground === 'none' ? 'transparent' : `rgba(0,0,0,${props.settings.subtitleOpacity})` }}
      onMediaEnterFullscreenRequest={(_target, event) => {
        if (!desktopFullscreen.isDesktop) return;
        event.preventDefault();
        void desktopFullscreen.enter();
      }}
      onMediaExitFullscreenRequest={(_target, event) => {
        if (!desktopFullscreen.isDesktop) return;
        event.preventDefault();
        void desktopFullscreen.exit();
      }}
      onProviderChange={onProviderChange} onCanPlay={onCanPlay} onError={onError} onEnded={onEnded}
      onPlaying={() => setError(null)} onPlay={() => props.onPlay?.()}
      onPause={() => { props.onPause?.(); if (!pendingSeek.current) report(resumePosition.current, player.current?.duration, false, true); }}
      onTimeUpdate={({ currentTime: time }) => {
        if (pendingSeek.current) return;
        resumePosition.current = time;
        setCurrentTime(time);
        updateGlobalVideoTime(time);
        report(time, player.current?.duration);
      }}>
      {/* Changing stream formats needs a fresh provider and media element. */}
      <MediaProvider key={mime}>
        {poster && <Poster className="vds-poster" src={poster} alt={props.animeName || ''} />}
        {(props.subtitles || []).map((subtitle, index) => <Track
          key={`${subtitle.url}|${subtitle.lang}`} src={getProxiedSubtitleUrl(subtitle.url, props.headers?.Referer, props.headers?.['User-Agent'])}
          kind="subtitles" label={subtitle.label || subtitle.lang} language={normalizeTrackLanguage(subtitle.lang)}
          type={/\.srt(?:[?#]|$)/i.test(subtitle.originalUrl || subtitle.url) ? 'srt' : /\.(ass|ssa)(?:[?#]|$)/i.test(subtitle.originalUrl || subtitle.url) ? 'ass' : 'vtt'}
          default={index === subtitleIndex} />)}
      </MediaProvider>
      <DefaultVideoLayout icons={defaultLayoutIcons} colorScheme="dark" playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2, 3]}
        menuContainer={isDesktopFullscreen ? container.current : undefined} />
      {activeSkip && !error && <button type="button" onClick={() => { if (player.current) player.current.currentTime = activeSkip.end; }}
        className="absolute bottom-24 right-4 z-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{activeSkip.label}</button>}
      {upNextCountdown !== null && <UpNextOverlay secondsLeft={upNextCountdown} total={props.settings.autoNextCountdownSeconds}
        title={props.nextEpisodeTitle} episodeNumber={props.nextEpisodeNumber} thumbnail={props.nextEpisodeThumbnail}
        onPlayNow={() => { setUpNextCountdown(null); props.onEpisodeEnd?.(); }} onCancel={() => setUpNextCountdown(null)} />}
      {error && <div role="alert" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/95 p-6 text-center">
        <p className="max-w-md text-sm">{error}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {props.onServerSwitch && <button type="button" onClick={props.onServerSwitch} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">{t('player.switchServer')}</button>}
          <button type="button" onClick={props.onFallback} className="min-h-11 rounded-lg border border-white/20 px-4">Use Tatakai player</button>
        </div>
      </div>}
    </MediaPlayer>
    <div data-vidstack-toolbar className="flex min-h-11 items-center gap-3 px-3 py-1 text-sm">
      {props.onBack && <button type="button" onClick={props.onBack} className="min-h-11 px-2">{t('common.back')}</button>}
      <span className="min-w-0 flex-1 truncate text-white/70">{props.serverName || 'Vidstack'}</span>
      <button type="button" onClick={() => setSettingsOpen(true)} className="flex min-h-11 items-center gap-2 px-2">
        <Settings className="size-4" aria-hidden="true" />{t('nav.settings')}
      </button>
    </div>
    <VideoSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} portalContainer={isDesktopFullscreen ? container.current : undefined} />
  </div>;
}
