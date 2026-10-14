import { useCallback, useEffect, useRef } from 'react';
import { PlaybackCoordinator, type ProgressSink } from './PlaybackCoordinator';
import type { PlaybackMode } from './player-core';

export function usePlaybackCoordinator(options: {
  mediaId?: string; episodeId?: string; url?: string; mode?: PlaybackMode;
  initialPosition?: number; sink?: ProgressSink;
}) {
  const ref = useRef(new PlaybackCoordinator());
  useEffect(() => {
    const core = ref.current;
    core.begin({ id: options.url || '', url: options.url || '', mode: options.mode || 'direct',
      mediaId: options.mediaId, episodeId: options.episodeId }, options.initialPosition);
    return () => core.flush();
  }, [options.mediaId, options.episodeId, options.url]);
  useEffect(() => { ref.current.sink = options.sink; }, [options.sink]);
  useEffect(() => {
    const core = ref.current;
    const save = () => core.flush();
    const visibility = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', visibility); core.dispose(); };
  }, []);
  const report = useCallback<ProgressSink>((p, d, c, f) => ref.current.report(p, d, c, f), []);
  return { coordinator: ref.current, report };
}
