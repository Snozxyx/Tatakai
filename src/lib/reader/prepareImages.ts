import { acquireReaderImageResource } from './imageResources';
import { readerNeedsBlob, readerResourceKey, resolveReaderImageResource } from './imageTransport';
import type { ReaderPageImage } from '@/components/reader/ReaderImage';

/** Returns leases, rather than a second image cache that navigation cannot use. */
export function prepareReaderImages(pages: ReaderPageImage[], options: {
  scope: string; mode: 'native' | 'blob'; signal: AbortSignal;
  source?: (page: ReaderPageImage) => string | null; cloud?: boolean;
}) {
  const leases = pages.map((page, index) => {
    const src = options.source?.(page) || page.proxiedImageUrl || page.imageUrl;
    const cloud = Boolean(options.cloud && options.source?.(page));
    const lease = acquireReaderImageResource(readerResourceKey(page, options.mode, src, options.scope),
      signal => resolveReaderImageResource(page, options.mode, src, signal, cloud), options.signal,
      index < 2 ? 5 : -10, readerNeedsBlob(page, options.mode, src, cloud), true);
    void lease.warm(index < 2).catch(() => undefined);
    return lease;
  });
  return () => leases.forEach(lease => lease.release());
}
