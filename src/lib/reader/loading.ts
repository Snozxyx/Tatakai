/** Settle an entry-owned task promptly even when a native provider cannot abort. */
export function abortableReaderTask<T>(
  task: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return task;
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(
        signal.reason || new DOMException("Reader cancelled", "AbortError")
      );
    if (signal.aborted) {
      task.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export function readerDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(
        signal.reason || new DOMException("Reader cancelled", "AbortError")
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export function readerEntryPages<T>(
  pages: T[],
  requestedIndex: number,
  spread = false
): T[] {
  if (!pages.length) return [];
  const index = Math.min(
    pages.length - 1,
    Math.max(
      0,
      Number.isFinite(requestedIndex) ? Math.floor(requestedIndex) : 0
    )
  );
  return pages.slice(index, index + (spread ? 2 : 1));
}

/** Readiness follows the actual starting pages, never chapter completion. */
export function readerEntryReady(
  pages: Array<{ pageNumber: number }>,
  settled: ReadonlySet<number>,
  requestedIndex: number,
  spread = false
) {
  const required = readerEntryPages(pages, requestedIndex, spread);
  return (
    required.length > 0 &&
    required.every((page) => settled.has(page.pageNumber))
  );
}

type ImageJob = {
  run: () => Promise<void>;
  signal: AbortSignal;
  priority: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  abort: () => void;
};
const imageJobs: ImageJob[] = [];
let activeImages = 0;
function drainImages() {
  imageJobs.sort((a, b) => b.priority - a.priority);
  while (activeImages < 3 && imageJobs.length) {
    const job = imageJobs.shift()!;
    job.signal.removeEventListener("abort", job.abort);
    if (job.signal.aborted) {
      job.reject(job.signal.reason);
      continue;
    }
    activeImages++;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeImages--;
        drainImages();
      });
  }
}

/** Bound JS blob/header fetches as well as cache warming; starting pages go first. */
export function scheduleReaderImage(
  run: () => Promise<void>,
  signal: AbortSignal,
  priority = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const job: ImageJob = {
      run,
      signal,
      priority,
      resolve,
      reject,
      abort: () => {
        const index = imageJobs.indexOf(job);
        if (index >= 0) imageJobs.splice(index, 1);
        reject(signal.reason);
      },
    };
    signal.addEventListener("abort", job.abort, { once: true });
    imageJobs.push(job);
    drainImages();
  });
}
