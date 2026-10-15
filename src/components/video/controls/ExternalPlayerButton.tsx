import { Loader2, MonitorPlay } from "lucide-react";
import { useEffect, useRef, useState } from 'react';
import { toast } from "sonner";
import { Capacitor } from '@capacitor/core';
import { launchExternalPlayer } from '@/core/player/external-player';
import type { PlaybackSubtitle } from '@/core/player/player-core';
import { useTranslation } from "react-i18next";

interface ExternalPlayerButtonProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  externalPlayerPath: string | null;
  currentSourceUrl?: string;
  isPlaying: boolean;
  animeName?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  onSaveProgress?: () => void;
  headers?: Record<string, string>;
  subtitles?: PlaybackSubtitle[];
  autoLaunch?: boolean;
}

export function ExternalPlayerButton({
  videoRef,
  externalPlayerPath,
  currentSourceUrl,
  isPlaying,
  animeName,
  episodeNumber,
  episodeTitle,
  onSaveProgress,
  headers,
  subtitles,
  autoLaunch = false,
}: ExternalPlayerButtonProps) {
  const { t } = useTranslation();
  const [launching, setLaunching] = useState(false);
  const [externalSource, setExternalSource] = useState<string | null>(null);
  const autoLaunchedSource = useRef<string | null>(null);
  const handleLaunchExternal = async (automatic = false) => {
    if (!currentSourceUrl || launching) return;
    setLaunching(true);

    try {
      const res = await launchExternalPlayer({
        executablePath: externalPlayerPath || undefined,
        url: automatic ? currentSourceUrl : videoRef.current?.currentSrc || currentSourceUrl,
        startTime: videoRef.current?.currentTime || 0,
        title: `${animeName || 'Tatakai'} - ${episodeNumber ? `Episode ${episodeNumber}` : ''} ${episodeTitle || ''}`.trim(),
        headers, subtitles,
      }, () => onSaveProgress?.());

      if (res.success) {
        toast.success(t('player.externalLaunched', { player: res.player || t('player.externalPlayerFallback') }));
        videoRef.current?.pause();
        if (automatic) setExternalSource(currentSourceUrl);
      } else {
        toast.error(res.error || t('player.externalLaunchFailed'));
      }
    } catch (err: any) {
      toast.error(err.message || t('player.externalLaunchError'));
    } finally {
      setLaunching(false);
    }
  };

  const launchRef = useRef(() => handleLaunchExternal(true));
  launchRef.current = () => handleLaunchExternal(true);
  useEffect(() => {
    if (!currentSourceUrl) { autoLaunchedSource.current = null; return; }
    if (!autoLaunch || !externalPlayerPath || autoLaunchedSource.current === currentSourceUrl) return;
    autoLaunchedSource.current = currentSourceUrl;
    void launchRef.current();
  }, [autoLaunch, currentSourceUrl, externalPlayerPath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!autoLaunch || externalSource !== currentSourceUrl || !video) return;
    const pause = () => video.pause();
    pause();
    video.addEventListener('play', pause);
    return () => video.removeEventListener('play', pause);
  }, [autoLaunch, externalSource, currentSourceUrl, videoRef]);

  if ((!externalPlayerPath && !Capacitor.isNativePlatform()) || !currentSourceUrl) return null;

  return (
    <button
      onClick={() => void handleLaunchExternal()}
      disabled={launching}
      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white disabled:opacity-50 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      title={t('player.externalPlayerTitle')}
      aria-label={launching ? t('migration.externalOpening') : t('migration.externalPlay')}
    >
      {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="w-4 h-4 md:w-5 md:h-5" />}
    </button>
  );
}
