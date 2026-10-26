import { throwCompatibilityAbort } from '../compatibility/abort';

/** Bound callers even when a native bridge cannot cancel its in-flight request. */
export async function extensionDeadline<T>(work: (signal: AbortSignal) => Promise<T>, milliseconds = 15000, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason ?? new DOMException('Aborted', 'AbortError'));
  if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Extension request timed out', 'TimeoutError')), milliseconds);
  let rejectAbort: () => void = () => {};
  try {
    throwCompatibilityAbort(controller.signal);
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    return await Promise.race([work(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', rejectAbort);
    parent?.removeEventListener('abort', abort);
  }
}
