/** Room-scoped media bytes. Signaling/membership authentication belongs to the room session. */
export interface MediaFetchOptions {
  signal?: AbortSignal;
  /** Inclusive HTTP byte range. */
  range?: { start: number; end?: number };
}

export interface WatchPartyMediaTransport {
  rootUrl: string;
  format?: 'hls' | 'mp4';
  fetch(url: string, options?: MediaFetchOptions): Promise<Response>;
  cancelPending(): void;
}

const MAX_RESOURCE = 32 * 1024 * 1024;
const CACHE_LIMIT = 32 * 1024 * 1024;
const MAX_REQUESTS = 4;
const CHUNK_SIZE = 16 * 1024 - 8;
const registry = new Map<string, WatchPartyMediaTransport>();

export function registerWatchPartyMedia(rootUrl: string, transport: WatchPartyMediaTransport): () => void {
  registry.set(rootUrl, transport);
  return () => { if (registry.get(rootUrl) === transport) registry.delete(rootUrl); };
}

export function findWatchPartyMedia(rootUrl: string): WatchPartyMediaTransport | undefined {
  return registry.get(rootUrl);
}

function abortError(): DOMException { return new DOMException('Media request cancelled', 'AbortError'); }

function checkRange(range?: MediaFetchOptions['range']): void {
  if (range && (!Number.isSafeInteger(range.start) || range.start < 0
    || (range.end !== undefined && (!Number.isSafeInteger(range.end) || range.end < range.start
      || range.end - range.start + 1 > MAX_RESOURCE)))) throw new Error('Invalid media byte range');
}

function rangeHeader(range?: MediaFetchOptions['range']): Record<string, string> {
  checkRange(range);
  return range ? { Range: `bytes=${range.start}-${range.end ?? ''}` } : {};
}

function safeHttpUrl(value: string): URL {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported media URL');
  url.hash = '';
  return url;
}

export function isLocalMediaUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '[::1]' || host === '[::]' || /^\[(?:f[cd]|fe[89ab]|::ffff:)/i.test(host) || host.endsWith('.localhost')
      || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
  } catch { return true; }
}

async function readBounded(response: Response, signal?: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESOURCE) { await response.body?.cancel(); throw new Error('Media resource exceeds transfer limit; use byte ranges'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel(); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESOURCE) throw new Error('Media resource exceeds transfer limit');
      chunks.push(value);
    }
    if (signal?.aborted) throw abortError();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); }
}

function responseHeaders(response: Response): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

type CacheEntry = { bytes: Uint8Array; headers: Record<string, string>; status: number };

/** A peer may request only the selected root or resources discovered in its HLS manifests. */
export class MediaResourceServer {
  private resources = new Map<string, string>();
  private playlists = new Set<string>();
  private scanned = new Set<string>();
  private cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  private controller = new AbortController();
  private fetcher: typeof fetch;
  private transfers = 0;
  private sourceLength = 0;
  private playlistBitrate = 0;
  private segmentDurations = new Map<string, number>();
  private waiters = new Set<() => void>();
  readonly rootUrl: string;

  constructor(private options: { rootUrl: string; sourceUrl?: string; format?: 'hls' | 'mp4'; headers?: Record<string, string>; fetcher?: typeof fetch; additionalResources?: { url: string; sourceUrl?: string }[] }) {
    this.rootUrl = safeHttpUrl(options.rootUrl).href;
    this.resources.set(this.rootUrl, safeHttpUrl(options.sourceUrl || options.rootUrl).href);
    for (const resource of options.additionalResources || []) {
      this.resources.set(safeHttpUrl(resource.url).href, safeHttpUrl(resource.sourceUrl || resource.url).href);
    }
    this.playlists.add(this.rootUrl);
    this.fetcher = options.fetcher || globalThis.fetch.bind(globalThis);
  }

  async prepare(): Promise<void> { await this.scan(this.rootUrl); }
  estimatedBitrate(duration: number): number | undefined {
    if (this.options.format === 'mp4' && this.sourceLength && Number.isFinite(duration) && duration > 0) return this.sourceLength * 8 / duration;
    return this.playlistBitrate || undefined;
  }

  /** Shared across all viewers, held until bytes leave the data channel. */
  async acquire(signal: AbortSignal): Promise<() => void> {
    while (this.transfers >= MAX_REQUESTS) {
      if (signal.aborted || this.controller.signal.aborted) throw abortError();
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { this.waiters.delete(wake); signal.removeEventListener('abort', aborted); this.controller.signal.removeEventListener('abort', aborted); };
        const wake = () => { cleanup(); resolve(); };
        const aborted = () => { cleanup(); reject(abortError()); };
        this.waiters.add(wake); signal.addEventListener('abort', aborted, { once: true }); this.controller.signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted || this.controller.signal.aborted) aborted();
      });
    }
    if (signal.aborted || this.controller.signal.aborted) throw abortError();
    this.transfers++;
    let released = false;
    return () => {
      if (released) return; released = true; this.transfers--;
      this.waiters.values().next().value?.();
    };
  }

  private discover(text: string, canonical: string, actual: string): void {
    if (!text.trimStart().startsWith('#EXTM3U')) return;
    if (/#EXTINF:/.test(text) && !/#EXT-X-ENDLIST/.test(text)) throw new Error('Live HLS is not supported in synchronized rooms');
    for (const match of text.matchAll(/(?:[: ,])BANDWIDTH=(\d+)/g)) this.playlistBitrate = Math.max(this.playlistBitrate, Number(match[1]));
    let duration = 0;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
      else if (line.trim() && !line.startsWith('#')) {
        if (duration > 0) this.segmentDurations.set(new URL(line.trim(), canonical).href, duration);
        duration = 0;
      }
    }
    if (/#EXT-X-KEY:.*METHOD=(?!NONE)[^,\r\n]+/.test(text)) throw new Error('Encrypted HLS is not supported in P2P rooms');
    const matches: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('#')) matches.push(trimmed);
      for (const match of trimmed.matchAll(/URI="([^"]+)"/g)) matches.push(match[1]);
    }
    for (const value of matches) {
      if (this.resources.size >= 10000) throw new Error('Media playlist contains too many resources');
      const target = safeHttpUrl(new URL(value, actual).href).href;
      const publicUrl = safeHttpUrl(new URL(value, canonical).href).href;
      // Relative loopback proxy paths are trusted only on the selected proxy origin.
      if (isLocalMediaUrl(target) && new URL(target).origin !== new URL(actual).origin) continue;
      this.resources.set(publicUrl, target);
      if (/\.m3u8(?:$|\?)/i.test(publicUrl) || /#EXT-X-STREAM-INF/.test(text)) this.playlists.add(publicUrl);
    }
  }

  private async scan(url: string): Promise<void> {
    if (this.scanned.has(url)) return;
    this.scanned.add(url);
    // MP4 roots are never downloaded just to authorize a byte-range request.
    if ((url === this.rootUrl && this.options.format === 'mp4') || /\.mp4(?:$|\?)/i.test(url)) return;
    try { await this.load(url, { range: undefined }); }
    catch (error) { this.scanned.delete(url); throw error; }
  }

  private async load(url: string, options: MediaFetchOptions): Promise<Response> {
    const actual = this.resources.get(url);
    if (!actual) throw new Error('Media resource is not authorized');
    const key = `${url}|${options.range?.start ?? ''}|${options.range?.end ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key); this.cache.set(key, cached);
      return new Response(cached.bytes.slice(), { status: cached.status, headers: cached.headers });
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    this.controller.signal.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted || this.controller.signal.aborted) controller.abort();
    const deadline = setTimeout(abort, 20000);
    try {
      const headers = { ...this.options.headers, ...rangeHeader(options.range) };
      if (new URL(actual).origin !== new URL(this.options.sourceUrl || this.rootUrl).origin) {
        for (const name of Object.keys(headers)) if (/^(authorization|cookie)$/i.test(name)) delete headers[name];
      }
      const response = await this.fetcher(actual, { headers, signal: controller.signal, credentials: 'omit', redirect: 'follow' });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Host media returned HTTP ${response.status}`); }
      if (options.range && response.status !== 206) { await response.body?.cancel(); throw new Error('Host source does not support byte ranges'); }
      const bytes = await readBounded(response, controller.signal);
      if (url === this.rootUrl && options.range) {
        const length = Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]);
        if (Number.isSafeInteger(length) && length > 0) this.sourceLength = length;
      }
      const segmentDuration = this.segmentDurations.get(url);
      if (segmentDuration) this.playlistBitrate = Math.max(this.playlistBitrate, bytes.byteLength * 8 / segmentDuration);
      const responseHeader = responseHeaders(response);
      // Bounded LRU: giant segments are served but never retained.
      if (bytes.byteLength <= CACHE_LIMIT / 2) {
        const previous = this.cache.get(key);
        if (previous) { this.cacheBytes -= previous.bytes.byteLength; this.cache.delete(key); }
        while (this.cacheBytes + bytes.byteLength > CACHE_LIMIT && this.cache.size) {
          const oldest = this.cache.keys().next().value!;
          this.cacheBytes -= this.cache.get(oldest)!.bytes.byteLength; this.cache.delete(oldest);
        }
        this.cache.set(key, { bytes, headers: responseHeader, status: response.status }); this.cacheBytes += bytes.byteLength;
      }
      if (!options.range && bytes.byteLength <= 2 * 1024 * 1024) {
        const text = new TextDecoder().decode(bytes);
        if (text.trimStart().startsWith('#EXTM3U')) this.discover(text, url, actual);
      }
      return new Response(bytes.slice(), { status: response.status, headers: responseHeader });
    } finally {
      clearTimeout(deadline); options.signal?.removeEventListener('abort', abort);
      this.controller.signal.removeEventListener('abort', abort);
    }
  }

  async fetch(value: string, options: MediaFetchOptions = {}): Promise<Response> {
    checkRange(options.range);
    const url = safeHttpUrl(value).href;
    if (!this.resources.has(url)) {
      // Discover master -> variant -> segment, capped to avoid crawling an entire catalog.
      for (let depth = 0; depth < 3 && !this.resources.has(url); depth++) {
        const pending = [...this.playlists].filter(p => !this.scanned.has(p)).slice(0, 32);
        for (const playlist of pending) { await this.scan(playlist); if (this.resources.has(url)) break; }
        if (!pending.length) break;
      }
    }
    if (!this.resources.has(url)) throw new Error('Media resource is not authorized');
    return this.load(url, options);
  }

  close(): void { this.controller.abort(); this.cache.clear(); this.resources.clear(); this.cacheBytes = 0; this.waiters.clear(); }
}

type Pending = {
  resolve: (response: Response) => void; reject: (error: Error) => void;
  chunks: Uint8Array[]; size: number; status: number; headers: Record<string, string>;
  cleanup: () => void;
};

/** One dedicated, reliable/ordered RTCDataChannel per host/viewer media connection. */
export class MediaPeer {
  private pending = new Map<number, Pending>();
  private serving = new Map<number, AbortController>();
  private nextId = 1;
  private closed = false;
  private sendTail: Promise<void> = Promise.resolve();
  get ready(): boolean { return !this.closed && this.channel.readyState === 'open'; }
  constructor(private channel: RTCDataChannel, private server?: MediaResourceServer, private options?: { beforeServe?: () => Promise<void> }) {
    channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = 128 * 1024;
    channel.addEventListener('message', this.onMessage);
    channel.addEventListener('close', this.onClose);
  }

  private send(value: string | ArrayBuffer): void {
    if (this.closed || this.channel.readyState !== 'open') throw new Error('Host media connection is not ready');
    this.channel.send(value as ArrayBuffer);
  }

  private async waitForDrain(signal: AbortSignal): Promise<void> {
    if (this.channel.bufferedAmount < 512 * 1024) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); this.channel.removeEventListener('bufferedamountlow', done); this.channel.removeEventListener('close', fail); signal.removeEventListener('abort', fail); };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Media transfer interrupted')); };
      const timeout = setTimeout(fail, 10000);
      this.channel.addEventListener('bufferedamountlow', done); this.channel.addEventListener('close', fail); signal.addEventListener('abort', fail, { once: true });
      if (signal.aborted) fail();
      else if (this.channel.bufferedAmount <= this.channel.bufferedAmountLowThreshold) done();
    });
  }

  request(url: string, options: MediaFetchOptions = {}): Promise<Response> {
    checkRange(options.range);
    if (options.signal?.aborted) return Promise.reject(abortError());
    if (this.pending.size >= MAX_REQUESTS) return Promise.reject(new Error('Too many concurrent peer media requests'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(id); if (!pending) return;
        this.pending.delete(id); pending.cleanup();
        try { this.send(JSON.stringify({ type: 'cancel', id })); } catch { /* connection closed */ }
        reject(abortError());
      };
      const timeout = setTimeout(() => {
        const pending = this.pending.get(id); if (!pending) return;
        this.pending.delete(id); pending.cleanup();
        try { this.send(JSON.stringify({ type: 'cancel', id })); } catch { /* connection closed */ }
        reject(new Error('Host media transfer timed out. Retry or check TURN settings.'));
      }, 25000);
      const cleanup = () => { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); };
      this.pending.set(id, { resolve, reject, chunks: [], size: 0, status: 200, headers: {}, cleanup });
      options.signal?.addEventListener('abort', abort, { once: true });
      try { this.send(JSON.stringify({ type: 'request', id, url, range: options.range })); }
      catch (error) { this.pending.delete(id); cleanup(); reject(error); }
    });
  }

  private onMessage = (event: MessageEvent) => {
    if (this.closed) return;
    if (event.data instanceof ArrayBuffer) {
      if (event.data.byteLength < 8 || event.data.byteLength > 16 * 1024) return;
      const view = new DataView(event.data); const id = view.getUint32(0); const offset = view.getUint32(4);
      const pending = this.pending.get(id); if (!pending) return;
      const bytes = new Uint8Array(event.data, 8);
      if (offset !== pending.size || pending.size + bytes.byteLength > MAX_RESOURCE) {
        this.pending.delete(id); pending.cleanup(); pending.reject(new Error('Invalid peer media response')); return;
      }
      pending.chunks.push(bytes); pending.size += bytes.byteLength; return;
    }
    if (typeof event.data !== 'string' || event.data.length > 16384) return;
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (!Number.isSafeInteger(msg.id) || msg.id < 1) return;
    if (msg.type === 'request' && this.server) { void this.serve(msg); return; }
    if (msg.type === 'cancel') { this.serving.get(msg.id)?.abort(); return; }
    const pending = this.pending.get(msg.id); if (!pending) return;
    if (msg.type === 'begin') {
      if (![200, 206].includes(msg.status) || !msg.headers || typeof msg.headers !== 'object') return;
      pending.status = msg.status;
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        if (typeof msg.headers[name] === 'string') pending.headers[name] = msg.headers[name].slice(0, 512);
      }
    } else if (msg.type === 'end' || msg.type === 'error') {
      this.pending.delete(msg.id); pending.cleanup();
      if (msg.type === 'error') { pending.reject(new Error(typeof msg.message === 'string' ? msg.message : 'Host media unavailable')); return; }
      const declared = Number(pending.headers['content-length']);
      if (Number.isFinite(declared) && pending.headers['content-length'] && declared !== pending.size) {
        pending.reject(new Error('Incomplete peer media response')); return;
      }
      const bytes = new Uint8Array(pending.size); let offset = 0;
      for (const chunk of pending.chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      pending.resolve(new Response(bytes, { status: pending.status, headers: pending.headers }));
    }
  };

  private async serve(msg: any): Promise<void> {
    const error = (message: string) => { try { this.send(JSON.stringify({ type: 'error', id: msg.id, message })); } catch { /* disconnected */ } };
    if (typeof msg.url !== 'string' || msg.url.length > 8192 || this.serving.has(msg.id) || this.serving.size >= MAX_REQUESTS) { error('Host media request limit reached'); return; }
    const controller = new AbortController(); this.serving.set(msg.id, controller);
    let release: (() => void) | undefined;
    try {
      release = await this.server!.acquire(controller.signal);
      await this.options?.beforeServe?.();
      const response = await this.server!.fetch(msg.url, { signal: controller.signal, range: msg.range });
      const operation = this.sendTail.catch(() => {}).then(async () => {
        if (controller.signal.aborted) throw abortError();
        this.send(JSON.stringify({ type: 'begin', id: msg.id, status: response.status, headers: responseHeaders(response) }));
        // Stay below WebRTC's minimum commonly supported message size.
        const chunkSize = CHUNK_SIZE;
        const reader = response.body?.getReader();
        let offset = 0;
        try {
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            if (offset + value.byteLength > MAX_RESOURCE) throw new Error('Media resource exceeds transfer limit');
            for (let local = 0; local < value.byteLength; local += chunkSize) {
              await this.waitForDrain(controller.signal);
              if (controller.signal.aborted) throw abortError();
              const length = Math.min(chunkSize, value.byteLength - local);
              const buffer = new ArrayBuffer(length + 8); const view = new DataView(buffer);
              view.setUint32(0, msg.id); view.setUint32(4, offset);
              new Uint8Array(buffer, 8).set(value.subarray(local, local + length)); this.send(buffer); offset += length;
            }
          }
        } finally { await reader?.cancel().catch(() => {}); }
        this.send(JSON.stringify({ type: 'end', id: msg.id }));
      });
      this.sendTail = operation; await operation;
    } catch (cause) {
      // Never return URLs, provider headers, or credentials over the error channel.
      const admission = cause instanceof Error && /^Host upload (capacity is insufficient|measurement)/.test(cause.message) ? cause.message : undefined;
      error(controller.signal.aborted ? 'Media transfer cancelled' : admission || 'Host could not supply this media resource. Retry or choose another source.');
    } finally { release?.(); this.serving.delete(msg.id); }
  }

  cancelPending(): void {
    for (const [id, pending] of this.pending) {
      pending.cleanup(); pending.reject(abortError());
      try { this.send(JSON.stringify({ type: 'cancel', id })); } catch { /* disconnected */ }
    }
    this.pending.clear();
  }
  private onClose = () => this.close();
  close(): void {
    if (this.closed) return;
    this.cancelPending(); this.closed = true;
    for (const controller of this.serving.values()) controller.abort(); this.serving.clear();
    this.channel.removeEventListener('message', this.onMessage); this.channel.removeEventListener('close', this.onClose);
  }
}

export function createWatchPartyTransport(options: {
  rootUrl: string; format?: 'hls' | 'mp4'; peer: () => MediaPeer | undefined; headers?: Record<string, string>;
  onMode?: (mode: 'direct' | 'peer') => void;
}): WatchPartyMediaTransport {
  const pending = new Set<AbortController>();
  let preferPeer = false;
  return {
    rootUrl: options.rootUrl,
    format: options.format,
    async fetch(url, request = {}) {
      if (request.signal?.aborted) throw abortError();
      const controller = new AbortController(); pending.add(controller);
      const abort = () => controller.abort(); request.signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 4000);
      try {
        if (!preferPeer && !isLocalMediaUrl(url)) {
          try {
            const response = await fetch(url, { headers: { ...options.headers, ...rangeHeader(request.range) }, signal: controller.signal, credentials: 'omit' });
            if (!response.ok || (request.range && response.status !== 206)) { await response.body?.cancel(); throw new Error('Direct media unavailable'); }
            const bytes = await readBounded(response, controller.signal);
            options.onMode?.('direct'); return new Response(bytes.slice().buffer, { status: response.status, headers: responseHeaders(response) });
          } catch {
            if (request.signal?.aborted) throw abortError();
            preferPeer = true;
          }
        }
        clearTimeout(timeout);
        let peer = options.peer();
        const waitStarted = performance.now();
        while ((!peer || !peer.ready) && performance.now() - waitStarted < 15000) {
          if (request.signal?.aborted) throw abortError();
          await new Promise(resolve => setTimeout(resolve, 100)); peer = options.peer();
        }
        if (!peer?.ready) throw new Error('Connecting to host. Retry after the peer connection is ready.');
        options.onMode?.('peer'); return await peer.request(url, request);
      } finally { clearTimeout(timeout); pending.delete(controller); request.signal?.removeEventListener('abort', abort); }
    },
    cancelPending() { for (const controller of pending) controller.abort(); options.peer()?.cancelPending(); },
  };
}
