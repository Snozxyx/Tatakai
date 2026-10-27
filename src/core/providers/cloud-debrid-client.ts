import { debridHttpRequest, type DebridHttpRequest } from './debrid-http';
import { DebridApiError, type DebridProvider } from './realdebrid-client';
import { selectBestDebridVideoFile, type DebridResolveOptions, type DebridVideoFile } from './debrid-orchestrator';

export type AvailabilityState = 'cached' | 'uncached' | 'unknown' | 'error';
export interface DebridProviderAdapter {
  readonly id: DebridProvider;
  readonly capabilities: { instantAvailability: boolean };
  verifyToken(): Promise<unknown>;
  checkAvailability(hashes: string[]): Promise<Record<string, AvailabilityState>>;
  resolve(magnet: string, options: DebridResolveOptions): Promise<string>;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Debrid resolution cancelled', 'AbortError');
}

export async function waitForDebrid(options: DebridResolveOptions): Promise<void> {
  throwIfAborted(options.signal);
  const delay = Math.max(50, options.pollIntervalMs ?? 1000);
  if (options.sleep) { await options.sleep(delay); throwIfAborted(options.signal); return; }
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Debrid resolution cancelled', 'AbortError')); };
    const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, delay);
    options.signal?.addEventListener('abort', abort, { once: true });
  });
}

export class CloudDebridClient implements DebridProviderAdapter {
  readonly capabilities: { instantAvailability: boolean };
  constructor(readonly id: 'alldebrid' | 'premiumize', private key: string, private request: DebridHttpRequest = debridHttpRequest) {
    this.capabilities = { instantAvailability: id === 'premiumize' };
  }
  private async api(endpoint: string, fields?: Record<string, string>, signal?: AbortSignal): Promise<any> {
    throwIfAborted(signal);
    const premium = this.id === 'premiumize';
    const query = new URLSearchParams(fields);
    if (premium) query.set('apikey', this.key.trim());
    // AllDebrid versions individual endpoints, not the entire API.
    const version = endpoint === '/magnet/status' ? 'v4.1' : 'v4';
    const base = premium ? 'https://www.premiumize.me/api' : `https://api.alldebrid.com/${version}`;
    const post = fields !== undefined;
    const result = await this.request(`${base}${endpoint}${!post && query.size ? `?${query}` : ''}`, {
      method: post ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(premium ? {} : { Authorization: `Bearer ${this.key.trim()}` }),
        ...(post ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: post ? query.toString() : undefined,
    });
    throwIfAborted(signal);
    const body = await result.json<any>();
    if (!result.ok || body.status !== 'success') {
      throw new DebridApiError(this.id, result.status, String(body.error?.message || body.message || body.error || 'Request failed'));
    }
    return premium ? body : body.data;
  }
  verifyToken(): Promise<unknown> { return this.api(this.id === 'premiumize' ? '/account/info' : '/user'); }
  async checkAvailability(hashes: string[]): Promise<Record<string, AvailabilityState>> {
    if (!this.capabilities.instantAvailability) return Object.fromEntries(hashes.map(h => [h, 'unknown']));
    // Cache lookup only: no transfer/create or directdl request here.
    const query = new URLSearchParams({ apikey: this.key.trim() });
    hashes.forEach(hash => query.append('items[]', hash));
    const response = await this.request('https://www.premiumize.me/api/cache/check', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: query.toString(),
    });
    const data = await response.json<any>();
    if (!response.ok || data.status !== 'success') throw new DebridApiError(this.id, response.status, 'Cache check failed');
    return Object.fromEntries(hashes.map((h, i) => [h, typeof data.response?.[i] === 'boolean' ? data.response[i] ? 'cached' : 'uncached' : 'unknown']));
  }
  async resolve(magnet: string, options: DebridResolveOptions): Promise<string> {
    throwIfAborted(options.signal);
    return this.id === 'alldebrid' ? this.resolveAllDebrid(magnet, options) : this.resolvePremiumize(magnet, options);
  }
  private async resolveAllDebrid(magnet: string, options: DebridResolveOptions): Promise<string> {
    const upload = await this.api('/magnet/upload', { 'magnets[]': magnet }, options.signal);
    const id = upload.magnets?.[0]?.id;
    if (!id || upload.magnets?.[0]?.error) throw new Error('AllDebrid did not accept the magnet');
    for (let i = 0; i < (options.maxPollAttempts ?? 180); i++) {
      const state = await this.api('/magnet/status', { id: String(id) }, options.signal);
      const info = Array.isArray(state.magnets) ? state.magnets.find((m: any) => String(m.id) === String(id)) : state.magnets;
      if (info?.error || Number(info?.statusCode) > 4) throw new Error('AllDebrid could not prepare this torrent');
      options.onProgress?.(info?.status || 'pending', info?.size ? 100 * Number(info.downloaded || 0) / info.size : undefined);
      if (Number(info?.statusCode) === 4) {
        const listing = await this.api('/magnet/files', { 'id[]': String(id) }, options.signal);
        const files: DebridVideoFile[] = [];
        const walk = (nodes: any[], prefix = '', depth = 0) => {
          if (depth > 12 || files.length > 1000) return;
          for (const node of nodes || []) {
            if (node.e) walk(node.e, `${prefix}${node.n}/`, depth + 1);
            else if (node.l) files.push({ id: node.l, name: `${prefix}${node.n}`, size: Number(node.s) || 0 });
          }
        };
        walk(listing.magnets?.find((m: any) => String(m.id) === String(id))?.files);
        const file = selectBestDebridVideoFile(files, options);
        if (!file) throw new Error('No matching playable file in AllDebrid torrent');
        const unlocked = await this.api('/link/unlock', { link: file.id }, options.signal);
        if (!/^https?:/i.test(unlocked.link || '')) throw new Error('AllDebrid did not return a playable URL');
        return unlocked.link;
      }
      await waitForDebrid(options);
    }
    throw new Error('AllDebrid is still preparing this torrent');
  }
  private async resolvePremiumize(magnet: string, options: DebridResolveOptions): Promise<string> {
    const hash = /btih:([a-f0-9]{40}|[a-z2-7]{32})/i.exec(magnet)?.[1]?.toLowerCase();
    const cached = hash ? (await this.checkAvailability([hash]))[hash] === 'cached' : false;
    if (!cached) {
      const transfer = await this.api('/transfer/create', { src: magnet }, options.signal);
      if (!transfer.id) throw new Error('Premiumize did not return a transfer ID');
      let ready = false;
      for (let i = 0; i < (options.maxPollAttempts ?? 180); i++) {
        const listing = await this.api('/transfer/list', undefined, options.signal);
        const info = listing.transfers?.find((t: any) => String(t.id) === String(transfer.id));
        if (info?.status === 'error') throw new Error(info.message || 'Premiumize transfer failed');
        options.onProgress?.(info?.status || 'pending', Number(info?.progress || 0) * 100);
        if (['finished', 'seeding'].includes(info?.status)) { ready = true; break; }
        await waitForDebrid(options);
      }
      if (!ready) throw new Error('Premiumize is still preparing this torrent');
    }
    const data = await this.api('/transfer/directdl', { src: magnet }, options.signal);
    const files = (data.content || []).map((f: any) => ({ id: f.link, name: f.path, size: Number(f.size) || 0 }));
    const file = selectBestDebridVideoFile(files, options);
    if (!file || !/^https?:/i.test(file.id)) throw new Error('No matching playable file in Premiumize torrent');
    return file.id;
  }
}
