import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useMobileConfig } from '@/hooks/ui/useMobileConfig';
import { buildMobileCloudImageProxyUrl } from '@/core/player/mobile-cloud-proxy';
import { effectiveReaderPreloading } from '@/components/reader/readerImageStyles';
import { isDataSaverEnabled } from '@/lib/mobile/dataSaver';
import { prepareReaderImages } from '@/lib/reader/prepareImages';
import type { ReaderSettings } from '@/lib/reader/settings';
import type { ReaderPageImage } from '@/components/reader/ReaderImage';

export function usePrepareReaderChapter(options: {
  identity: string; ready: boolean; settings: ReaderSettings;
  load: (signal: AbortSignal) => Promise<{ pages: ReaderPageImage[]; scope: string } | null>;
}) {
  const load = useRef(options.load);
  load.current = options.load;
  const { config } = useMobileConfig();
  const preload = effectiveReaderPreloading(options.settings);
  const saver = isDataSaverEnabled();
  useEffect(() => {
    if (!options.ready || !options.identity || saver || preload === 'none' || !options.settings.prefetchAdjacentChapters) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void load.current(controller.signal).then(chapter => {
      if (!chapter || controller.signal.aborted) return;
      const cloud = Capacitor.isNativePlatform() && config.cloudProxyByDefault;
      release = prepareReaderImages(preload === 'full' ? chapter.pages : chapter.pages.slice(0, 2), {
        scope: chapter.scope, mode: options.settings.loadingMethod, signal: controller.signal,
        cloud, source: cloud ? buildMobileCloudImageProxyUrl : undefined,
      });
    }).catch(() => undefined);
    return () => { controller.abort(); release?.(); };
  }, [options.identity, options.ready, options.settings.prefetchAdjacentChapters, options.settings.loadingMethod, preload, saver, config.cloudProxyByDefault]);
}
