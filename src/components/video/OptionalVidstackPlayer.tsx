import { cloneElement, isValidElement, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useVideoSettings } from '@/hooks/media/useVideoSettings';
import { isTV } from '@/core/tv/device';
import { selectPreferredSource } from '@/lib/video/preferredSource';
import { canUseVidstackSource } from '@/lib/video/vidstackSource';
import { LoadingOverlay } from './overlays/LoadingOverlay';
import type { VideoPlayerExtendedProps, VideoPlayerProps } from './VideoPlayer.types';

export type OptionalVidstackProps = VideoPlayerProps & VideoPlayerExtendedProps & {
  onBack?: () => void;
  torrentUrl?: string;
  sourceType?: string;
};

const VidstackPlayer = lazy(() => import('./VidstackPlayer'));

/** Load the alternative engine only when selected for a compatible stream. */
export function OptionalVidstackPlayer({ children, ...props }: OptionalVidstackProps & { children: ReactNode }) {
  const { settings } = useVideoSettings();
  const source = selectPreferredSource(props.sources, settings.defaultQuality);
  const sourceKey = `${props.animeId || ''}|${props.episodeId || props.episodeNumber || ''}|${source?.url || ''}`;
  const [fallbackSource, setFallbackSource] = useState<string | null>(null);
  const position = useRef(props.initialSeekSeconds || 0);
  useEffect(() => { setFallbackSource(null); }, [settings.playerEngine]);
  const compatible = !isTV() && canUseVidstackSource(source, props.headers)
    && !props.externalRef && !props.isTimelineLocked && !props.hideTimelineUi && !props.isOffline
    && !props.torrentSessionId && !props.torrentStats && !props.torrentUrl && props.sourceType !== 'torrent'
    && !props.subtitles?.some(subtitle => subtitle.url.startsWith('mobile-proxy:'))
    && settings.videoEnhancementEngine === 'off';
  if (settings.playerEngine !== 'vidstack' || !compatible || fallbackSource === sourceKey) {
    return <>{fallbackSource === sourceKey && isValidElement<{ initialSeekSeconds?: number }>(children)
      ? cloneElement(children, { initialSeekSeconds: position.current }) : children}</>;
  }
  return <Suspense fallback={<div className="relative aspect-video bg-black"><LoadingOverlay isVisible serverName={props.serverName} /></div>}>
    <VidstackPlayer {...props} settings={settings} onProgressUpdate={(time, ...rest) => {
      position.current = time;
      props.onProgressUpdate?.(time, ...rest);
    }} onFallback={() => setFallbackSource(sourceKey)} />
  </Suspense>;
}
