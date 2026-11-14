import type { CSSProperties } from 'react';
import type { ReaderSettings } from '@/lib/reader/settings';
import { readerPageRenderKey } from '@/lib/reader/imageLifecycle';
import { ReaderImage, type ReaderPageImage } from './ReaderImage';
import { readerPageIsEager, readerPageLoadPriority } from './readerImageStyles';

/** Keep loaded pages mounted while turning pages, including the full preload. */
export function ReaderPagedImages({ pages, chapterScope, resourceScope, pageIndex, settings, style, touchOrNative,
  upscaleScope, onRetryChapter, onPageLoaded }: {
  pages: ReaderPageImage[];
  chapterScope: string;
  resourceScope?: string;
  pageIndex: number;
  settings: ReaderSettings;
  style: CSSProperties;
  touchOrNative: boolean;
  upscaleScope?: string;
  onRetryChapter?: () => void;
  onPageLoaded?: (pageNumber: number) => void;
}) {
  return <>{pages.map((page, index) => {
    const visible = index === pageIndex || (settings.doublePage && index === pageIndex + 1);
    if (!visible && !readerPageIsEager(settings, index, pageIndex, touchOrNative)) return null;
    return (
      <div key={readerPageRenderKey(chapterScope, page)} aria-hidden={!visible || undefined}
        style={{ display: visible ? 'contents' : 'none' }}>
        <ReaderImage page={page} resourceScope={resourceScope} mode={settings.loadingMethod} style={style} eager
          priority={readerPageLoadPriority(index, pageIndex, settings.doublePage)}
          upscaling={settings} upscaleScope={upscaleScope}
          onRetryChapter={onRetryChapter} onPageLoaded={onPageLoaded} />
      </div>
    );
  })}</>;
}
