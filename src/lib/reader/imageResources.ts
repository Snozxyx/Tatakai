import { abortableReaderTask, prioritizeReaderImage, scheduleReaderImage } from './loading';

export interface ReaderImageResource { src: string; owned: boolean; release?: () => void }
type Dimensions = { width: number; height: number };
type Resource = {
  key: string; controller: AbortController; users: number;
  promise: Promise<ReaderImageResource>; value?: ReaderImageResource;
  warm?: Promise<void>; timer?: ReturnType<typeof setTimeout>;
  disposed?: boolean;
};
const resources = new Map<string, Resource>();
const dimensions = new Map<string, Dimensions>();

export function rememberReaderDimensions(key: string, width: number, height: number) {
  if (!(width > 0 && height > 0)) return;
  dimensions.delete(key);
  dimensions.set(key, { width, height });
  if (dimensions.size > 1000) dimensions.delete(dimensions.keys().next().value);
}
export function readerDimensions(key: string) { return dimensions.get(key); }

function dispose(record: Resource) {
  if (record.disposed) return;
  record.disposed = true;
  clearTimeout(record.timer);
  record.controller.abort();
  if (resources.get(record.key) === record) resources.delete(record.key);
  if (record.value?.owned) URL.revokeObjectURL(record.value.src);
  record.value?.release?.();
}

/** Each subscriber owns a lease, so cancelling prefetch cannot cancel a reader. */
export function acquireReaderImageResource(
  key: string, loader: (signal: AbortSignal) => Promise<ReaderImageResource>,
  signal: AbortSignal, priority = 0, scheduled = true, background = false,
) {
  let record = resources.get(key);
  if (!record) {
    const controller = new AbortController();
    record = { key, controller, users: 0, promise: undefined! };
    const current = record;
    const run = async () => {
      await abortableReaderTask(loader(controller.signal).then(value => {
        if (controller.signal.aborted) {
          if (value.owned) URL.revokeObjectURL(value.src);
          value.release?.();
          throw controller.signal.reason;
        }
        current.value = value;
      }), controller.signal);
    };
    current.promise = (scheduled ? scheduleReaderImage(run, controller.signal, priority, background) : run())
      .then(() => current.value!)
      .catch(error => {
        if (resources.get(key) === current) resources.delete(key);
        throw error;
      });
    current.promise.catch(() => undefined);
    resources.set(key, current);
  }
  const current = record;
  clearTimeout(current.timer);
  current.users++;
  prioritizeReaderImage(current.controller.signal, priority);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal.removeEventListener('abort', release);
    if (--current.users === 0) {
      // Allow a prepared chapter to be adopted during a route transition.
      // Pending work is cancelled promptly; settled resources get a short grace.
      if (!current.value) dispose(current);
      else current.timer = setTimeout(() => dispose(current), 1000);
    }
  };
  signal.addEventListener('abort', release, { once: true });
  if (signal.aborted) release();
  return {
    promise: abortableReaderTask(current.promise, signal), release,
    promote: (next: number) => prioritizeReaderImage(current.controller.signal, next),
    warm: (decode = false) => {
      if (!current.warm) {
        current.warm = current.promise.then(value => scheduleReaderImage(async () => {
          await loadReaderImage(value.src, key, current.controller.signal, decode);
        }, current.controller.signal, priority, background)).catch(error => {
          current.warm = undefined;
          throw error;
        });
        current.warm.catch(() => undefined);
      }
      return abortableReaderTask(current.warm, signal);
    },
  };
}

function loadReaderImage(src: string, key: string, signal: AbortSignal, decode: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    const timer = setTimeout(() => finish(new Error('Image preparation timed out')), 30000);
    const abort = () => finish(signal.reason || new DOMException('Cancelled', 'AbortError'));
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      image.onload = image.onerror = null;
      if (error) { image.removeAttribute('src'); reject(error); } else resolve();
    };
    image.onload = async () => {
      try {
        rememberReaderDimensions(key, image.naturalWidth, image.naturalHeight);
        if (decode && image.decode) await image.decode();
        finish();
      } catch (error) { finish(error); }
    };
    image.onerror = () => finish(new Error('Image preparation failed'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else image.src = src;
  });
}

/** Used by diagnostics/tests; resources are leases, metadata is bounded separately. */
export function readerResourceCounts() { return { images: resources.size, dimensions: dimensions.size }; }
export function releaseInactiveReaderImages() { resources.forEach(record => { if (!record.users) dispose(record); }); }
