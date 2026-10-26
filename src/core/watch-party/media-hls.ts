import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';
import type { WatchPartyMediaTransport } from './media';

/** A loader per request: hls.js owns retry policy; the transport owns direct/P2P failover. */
export function createWatchPartyHlsLoader(transport: WatchPartyMediaTransport) {
  return class WatchPartyHlsLoader implements Loader<LoaderContext> {
    context: LoaderContext | null = null;
    stats: LoaderStats = {
      aborted: false, loaded: 0, total: 0, retry: 0, chunkCount: 0, bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
    private controller = new AbortController();
    private response: Response | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private callbacks: LoaderCallbacks<LoaderContext> | null = null;
    private completed = false;

    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      this.context = context; this.callbacks = callbacks;
      this.stats.loading.start = performance.now();
      const timeout = config.loadPolicy?.maxLoadTimeMs || config.timeout || 30000;
      this.timer = setTimeout(() => {
        if (this.stats.aborted) return;
        this.stats.aborted = true; this.controller.abort();
        this.completed = true;
        callbacks.onTimeout(this.stats, context, null);
      }, timeout);
      void transport.fetch(context.url, {
        signal: this.controller.signal,
        range: context.rangeEnd !== undefined && context.rangeEnd > (context.rangeStart || 0)
          ? { start: context.rangeStart || 0, end: context.rangeEnd - 1 } : undefined,
      }).then(async response => {
        this.response = response; this.stats.loading.first = performance.now();
        const data = context.responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text();
        if (typeof data === 'string' && /#EXTINF:/.test(data) && !/#EXT-X-ENDLIST/.test(data)) throw new Error('Live HLS is not supported in synchronized rooms');
        if (this.stats.aborted) return;
        clearTimeout(this.timer);
        this.stats.loaded = this.stats.total = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
        this.stats.chunkCount = 1; this.stats.loading.end = performance.now();
        this.completed = true;
        this.stats.bwEstimate = this.stats.loaded * 8000 / Math.max(1, this.stats.loading.end - this.stats.loading.start);
        callbacks.onSuccess({ url: context.url, data, code: response.status }, this.stats, context, response);
      }).catch(error => {
        clearTimeout(this.timer);
        if (!this.stats.aborted) { this.completed = true; callbacks.onError({ code: 0, text: error instanceof Error ? error.message : 'Room media unavailable' }, context, null, this.stats); }
      });
    }

    getResponseHeader(name: string): string | null { return this.response?.headers.get(name) || null; }
    abort(): void {
      if (this.stats.aborted || this.completed) return;
      this.stats.aborted = true; clearTimeout(this.timer); this.controller.abort();
      if (this.context) this.callbacks?.onAbort?.(this.stats, this.context, null);
    }
    destroy(): void { this.abort(); this.callbacks = null; this.context = null; this.response = null; }
  };
}
