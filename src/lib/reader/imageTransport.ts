import { getMobileHeaderedImageBlobUrl, getMobileProxyImageBlobUrl, isMobileProxyUrl, isNativeProxyUrl, normalizeMobileHeaders, retainMobileReaderBlobUrl } from '@/core/extensions/mobile/mobileProxy';
import { shouldUseReaderHeaderBlob } from './imageLifecycle';
import { readerDelay } from './loading';
import type { ReaderPageImage } from '@/components/reader/ReaderImage';
import type { ReaderImageResource } from './imageResources';

export function readerResourceKey(page: ReaderPageImage, mode: 'native' | 'blob', src = page.proxiedImageUrl || page.imageUrl, scope = '') {
  return JSON.stringify([scope, page.pageNumber, src, mode, page.originalUrl || '', page.imageUrl,
    Object.entries(normalizeMobileHeaders(page.headers)).sort(([a], [b]) => a.localeCompare(b))]);
}

export function readerNeedsBlob(page: ReaderPageImage, mode: 'native' | 'blob', src: string, cloud = false) {
  return !isNativeProxyUrl(src) && (mode === 'blob' || isMobileProxyUrl(src) || shouldUseReaderHeaderBlob({
    src, headerCount: cloud ? 0 : Object.keys(normalizeMobileHeaders(page.headers)).length,
    isMobileProxy: isMobileProxyUrl(src), isNativeLoopback: isNativeProxyUrl(src),
  }));
}

export async function resolveReaderImageResource(page: ReaderPageImage, mode: 'native' | 'blob', src: string, signal: AbortSignal, cloud = false): Promise<ReaderImageResource> {
  if (!readerNeedsBlob(page, mode, src, cloud)) return { src, owned: false };
  if (isMobileProxyUrl(src)) {
    const url = await getMobileProxyImageBlobUrl(src, { originalUrl: page.originalUrl || page.imageUrl, headers: page.headers, retries: 1 });
    if (!url) throw new Error('Image proxy failed');
    signal.throwIfAborted();
    return { src: url, owned: false, release: retainMobileReaderBlobUrl(url) };
  }
  if (!cloud && Object.keys(normalizeMobileHeaders(page.headers)).length) {
    const url = await getMobileHeaderedImageBlobUrl(src, page.headers, { retries: 1 });
    if (!url) throw new Error('Image headers failed');
    signal.throwIfAborted();
    return { src: url, owned: false, release: retainMobileReaderBlobUrl(url) };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Empty image');
      signal.throwIfAborted();
      return { src: URL.createObjectURL(blob), owned: true };
    } catch (error) {
      if (signal.aborted || attempt >= 2) throw error;
      await readerDelay(500 * (attempt + 1), signal);
    }
  }
}
