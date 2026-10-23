import { throwCompatibilityAbort } from './abort';

/** Network addon jobs share a small pool; preserve every input's result/order. */
export async function mapProviderTasks<T, R>(rows: T[], work: (row: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = new Array(rows.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (next < rows.length) { throwCompatibilityAbort(signal); const index = next++; results[index] = await work(rows[index]); }
  }));
  throwCompatibilityAbort(signal);
  return results;
}

export function compatibilityBudget(milliseconds: number | null, upstream?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(upstream?.reason || new DOMException('Aborted', 'AbortError'));
  const timer = milliseconds === null ? undefined : setTimeout(() => controller.abort(new DOMException('Provider execution timed out', 'TimeoutError')), milliseconds);
  if (upstream?.aborted) abort(); else upstream?.addEventListener('abort', abort, { once: true });
  return { signal: controller.signal, dispose() { clearTimeout(timer); upstream?.removeEventListener('abort', abort); } };
}

/** Independent lanes keep a slow native host from consuming another host's budget. */
export async function runCompatibilitySources<T extends { ecosystem: string }>(sources: T[], work: (source: T, signal: AbortSignal) => Promise<void>, options: { signal?: AbortSignal; totalMs?: number | null; sourceMs?: number; concurrency?: number } = {}) {
  const overall = compatibilityBudget(options.totalMs === undefined ? 120000 : options.totalMs, options.signal);
  const groups = new Map<string, T[]>();
  for (const source of sources) { const rows = groups.get(source.ecosystem) || []; rows.push(source); groups.set(source.ecosystem, rows); }
  const lanes = [...groups].map(([kind, rows]) => ({ kind, rows, next: 0, active: 0 }));
  let cursor = 0, failure: unknown;
  try {
    // A shared pool bounds simultaneous HTML/DEX/interpreter work, rather than
    // starting two workflows for every installed ecosystem. Rotate lanes fairly.
    await Promise.all(Array.from({ length: Math.min(sources.length, Math.max(1, Math.min(4, Math.floor(options.concurrency || 2)))) }, async () => {
      while (!overall.signal.aborted && !failure) {
        let lane: typeof lanes[number] | undefined;
        for (let offset = 0; offset < lanes.length; offset++) {
          const index = (cursor + offset) % lanes.length, candidate = lanes[index];
          if (candidate.next < candidate.rows.length && candidate.active < (candidate.kind === 'aniyomi' ? 1 : 2)) { lane = candidate; cursor = (index + 1) % lanes.length; break; }
        }
        if (!lane) break;
        const source = lane.rows[lane.next++]; lane.active++;
        // Queueing consumes no provider execution time and retains no payloads.
        const budget = compatibilityBudget(options.sourceMs ?? (lane.kind === 'aniyomi' ? 90000 : 45000), overall.signal);
        try { await work(source, budget.signal); } catch (error) { failure = error; }
        finally { budget.dispose(); lane.active--; }
      }
    }));
    throwCompatibilityAbort(options.signal);
    if (failure) throw failure;
    return lanes.flatMap(lane => lane.rows.slice(lane.next));
  } finally { overall.dispose(); }
}
