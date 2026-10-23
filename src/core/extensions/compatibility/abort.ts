/** Scoped fallbacks for native WebViews; never patches global browser prototypes. */
export function throwCompatibilityAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
}
export async function awaitCompatibility<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwCompatibilityAbort(signal);
  if (!signal) return promise;
  let abort: () => void;
  const canceled = new Promise<never>((_, reject) => { abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([promise, canceled]); }
  finally { signal.removeEventListener('abort', abort!); }
}
function portable(signal: AbortSignal): AbortSignal {
  if (typeof signal.throwIfAborted !== 'function') Object.defineProperty(signal, 'throwIfAborted', { value: () => throwCompatibilityAbort(signal) });
  return signal;
}
export function compatibilityTimeout(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return portable(AbortSignal.timeout(milliseconds));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Source request timed out', 'TimeoutError')), milliseconds);
  (timer as any).unref?.();
  return portable(controller.signal);
}
export function compatibilityAny(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return portable(AbortSignal.any(signals));
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  const cleanup = () => { for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener); listeners.clear(); };
  for (const signal of new Set(signals)) {
    const abort = () => { controller.abort(signal.reason); cleanup(); };
    if (signal.aborted) { abort(); break; }
    listeners.set(signal, abort); signal.addEventListener('abort', abort, { once: true });
  }
  return portable(controller.signal);
}
