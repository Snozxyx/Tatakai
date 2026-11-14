import type { QueryClient } from '@tanstack/react-query';
import { abortableReaderTask } from './loading';

const owners = new WeakMap<QueryClient, Map<string, number>>();

/** Query observers and other preparers retain ownership when one caller leaves. */
export async function fetchReaderChapter<T>(client: QueryClient, query: {
  queryKey: readonly unknown[]; queryFn: (context: { signal: AbortSignal }) => Promise<T>;
  staleTime: number; gcTime: number;
}, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let leases = owners.get(client);
  if (!leases) { leases = new Map(); owners.set(client, leases); }
  const key = JSON.stringify(query.queryKey);
  leases.set(key, (leases.get(key) || 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (leases!.get(key) || 1) - 1;
    if (remaining) leases!.set(key, remaining); else leases!.delete(key);
    signal.removeEventListener('abort', release);
    if (signal.aborted && !remaining) {
      const current = client.getQueryCache().find({ queryKey: query.queryKey, exact: true });
      if (current && current.getObserversCount() === 0) void client.cancelQueries({ queryKey: query.queryKey, exact: true });
    }
  };
  signal.addEventListener('abort', release, { once: true });
  try { return await abortableReaderTask(client.fetchQuery(query), signal); }
  finally { release(); }
}
