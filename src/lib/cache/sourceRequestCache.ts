/** Short-lived URL cache with shared requests and progressive subscribers. */
export function createSourceRequestCache<T>(ttlMs = 5 * 60_000, capacity = 100) {
  const cached = new Map<string, { value: T; expires: number }>();
  const pending = new Map<string, { promise: Promise<T>; listeners: Set<(value: T) => void>; latest?: T }>();
  return {
    clear() { cached.clear(); },
    peek(key: string): T | undefined {
      const hit = cached.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;
      return pending.get(key)?.latest;
    },
    has(key: string) {
      const hit = cached.get(key);
      return !!hit && hit.expires > Date.now();
    },
    async get(key: string, load: (publish: (value: T) => void) => Promise<T>, accept: (value: T) => boolean, onValue?: (value: T) => void): Promise<T> {
      const hit = cached.get(key);
      if (hit && hit.expires > Date.now()) { onValue?.(hit.value); return hit.value; }
      cached.delete(key);
      let request = pending.get(key);
      if (!request) {
        const listeners = new Set<(value: T) => void>();
        request = { listeners, promise: undefined as unknown as Promise<T> };
        const active = request;
        // Defer loading until the first subscriber has been registered.
        active.promise = Promise.resolve().then(() => load(value => {
          active.latest = value;
          for (const listener of active.listeners) listener(value);
        })).then(value => {
          if (accept(value)) {
            cached.set(key, { value, expires: Date.now() + ttlMs });
            while (cached.size > capacity) cached.delete(cached.keys().next().value!);
          }
          return value;
        }).finally(() => pending.delete(key));
        pending.set(key, active);
      }
      if (onValue) { request.listeners.add(onValue); if (request.latest !== undefined) onValue(request.latest); }
      try { return await request.promise; }
      finally { if (onValue) request.listeners.delete(onValue); }
    },
  };
}
