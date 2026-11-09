interface WaitingRequest { start(): void; signal?: AbortSignal; abort(): void }
let active = 0;
const waiting: WaitingRequest[] = [];
function pump() {
  while (active < 2 && waiting.length) waiting.shift()!.start();
}
/** Bound initial and paginated saved-shelf requests, including after a rapid scroll. */
export function runCustomShelfRequest<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => signal?.reason || new DOMException('Request aborted', 'AbortError');
    const request: WaitingRequest = {
      signal,
      abort() { const index = waiting.indexOf(request); if (index >= 0) waiting.splice(index, 1); reject(aborted()); },
      start() {
        signal?.removeEventListener('abort', request.abort);
        if (signal?.aborted) { reject(aborted()); pump(); return; }
        active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => { active--; pump(); });
      },
    };
    if (signal?.aborted) { reject(aborted()); return; }
    signal?.addEventListener('abort', request.abort, { once: true });
    waiting.push(request);
    pump();
  });
}
