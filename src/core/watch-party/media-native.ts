import { randomUUID } from '../../lib/uuid';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { WatchPartyMediaTransport } from './media';

const BLOCK_SIZE = 1024 * 1024;
const MAX_RESOURCES = 4096;

export interface NativeRequest { id: string; token: string; resourceId: string; range?: string; method: string; }
export interface NativePeerMediaPlugin {
  registerPeerSource(): Promise<{ token: string; proxyUrl: string }>;
  unregisterPeerSource(options: { token: string }): Promise<void>;
  peerMediaResponse(options: {
    id: string; token: string; status: number; headers: Record<string, string>; body: string; final: boolean;
  }): Promise<void>;
  addListener(name: 'peerMediaRequest' | 'peerMediaCancel', listener: (event: NativeRequest) => void): Promise<PluginListenerHandle>;
}

/** Convert only one bounded bridge block, never an entire MP4, to base64. */
function encodeBlock(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function parseNativeMediaRange(value: string | undefined, total: number): { start: number; end: number; partial: boolean } {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Media length unavailable');
  if (!value) return { start: 0, end: total - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid media range');
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(total - 1, Number(match[2])) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
    throw new Error('Media range unavailable');
  }
  return { start, end, partial: true };
}

export function rewriteNativePlaylist(text: string, playlistUrl: string, register: (url: string) => string): string {
  const rewrite = (reference: string) => {
    const url = new URL(reference, playlistUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported playlist reference');
    return register(url.href);
  };
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${rewrite(uri)}"`);
    return rewrite(line.trim());
  }).join('\n');
}

/** Native AVPlayer / WebView media loads bytes from loopback; WebRTC stays in the web shell. */
export async function registerNativeWatchPartyMedia(transport: WatchPartyMediaTransport): Promise<{ url: string; close(): Promise<void> }> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('TatakaiLocalProxy')) {
    throw new Error('This player needs the native watchroom media bridge');
  }
  const plugin = registerPlugin<NativePeerMediaPlugin>('TatakaiLocalProxy');
  return createNativeWatchPartyMediaBridge(transport, plugin);
}

/** Dependency-injected bridge core, also used to verify bounded streaming without a device. */
export async function createNativeWatchPartyMediaBridge(transport: WatchPartyMediaTransport, plugin: NativePeerMediaPlugin): Promise<{ url: string; close(): Promise<void> }> {
  const requests = new Map<string, AbortController>();
  const resources = new Map<string, string>([['root', transport.rootUrl]]);
  const identifiers = new Map<string, string>([[transport.rootUrl, 'root']]);
  let token = '';
  let rootUrl = '';
  let closed = false;
  const register = (url: string) => {
    let resourceId = identifiers.get(url);
    if (!resourceId) {
      if (resources.size >= MAX_RESOURCES) throw new Error('Playlist contains too many resources');
      resourceId = randomUUID().replace(/-/g, '');
      resources.set(resourceId, url);
      identifiers.set(url, resourceId);
    }
    return rootUrl.replace(/\/root$/, `/${resourceId}`);
  };

  const serve = async (event: NativeRequest) => {
    if (closed || event.token !== token) return;
    const controller = new AbortController();
    requests.set(event.id, controller);
    let started = false;
    const send = async (status: number, headers: Record<string, string>, bytes: Uint8Array, final: boolean) => {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      await plugin.peerMediaResponse({ id: event.id, token, status, headers, body: encodeBlock(bytes), final });
      started = true;
    };
    try {
      const url = resources.get(event.resourceId);
      if (!url) throw new Error('Unknown room media resource');
      const options = { signal: controller.signal };
      const knownPlaylist = (event.resourceId === 'root' && transport.format === 'hls')
        || /\.m3u8(?:[?#]|$)/i.test(url);
      const mp4Root = event.resourceId === 'root' && (transport.format === 'mp4' || /\.mp4(?:[?#]|$)/i.test(url));
      // MP4 probes remain ranged; HLS origins often ignore Range entirely.
      let response: Response;
      if (knownPlaylist || (event.resourceId !== 'root' && !event.range)) response = await transport.fetch(url, options);
      else {
        try { response = await transport.fetch(url, { ...options, range: { start: 0, end: BLOCK_SIZE - 1 } }); }
        catch (error) {
          if (mp4Root || controller.signal.aborted) throw error;
          response = await transport.fetch(url, options);
        }
      }
      if (!response.ok) throw new Error('Room media unavailable');
      let bytes = new Uint8Array(await response.arrayBuffer());
      const isPlaylist = /mpegurl/i.test(response.headers.get('content-type') || '')
        || new TextDecoder().decode(bytes.subarray(0, 16)).trimStart().startsWith('#EXTM3U');
      if (isPlaylist) {
        const rangeTotal = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
        if (rangeTotal && Number(rangeTotal) > bytes.length) {
          response = await transport.fetch(url, options);
          bytes = new Uint8Array(await response.arrayBuffer());
        }
        bytes = new TextEncoder().encode(rewriteNativePlaylist(new TextDecoder().decode(bytes), url, register));
        const range = parseNativeMediaRange(event.range, bytes.length);
        const headers: Record<string, string> = { 'Content-Type': 'application/vnd.apple.mpegurl',
          'Content-Length': String(range.end - range.start + 1), 'Accept-Ranges': 'bytes' };
        if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${bytes.length}`;
        for (let offset = range.start; offset <= range.end; offset += BLOCK_SIZE) {
          const end = Math.min(range.end + 1, offset + BLOCK_SIZE);
          await send(range.partial ? 206 : 200, headers,
            event.method === 'HEAD' ? new Uint8Array() : bytes.subarray(offset, end), event.method === 'HEAD' || end > range.end);
          if (event.method === 'HEAD') break;
        }
        return;
      }
      const contentRange = response.headers.get('content-range');
      const total = contentRange?.match(/\/(\d+)$/)?.[1]
        ?? (response.status === 200 ? String(bytes.length) : undefined);
      const range = parseNativeMediaRange(event.range, Number(total));
      const headers: Record<string, string> = { 'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': String(range.end - range.start + 1), 'Accept-Ranges': 'bytes' };
      if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${total}`;
      if (event.method === 'HEAD') { await send(range.partial ? 206 : 200, headers, new Uint8Array(), true); return; }
      // No whole-file accumulation: native send acknowledgements apply backpressure per block.
      for (let offset = range.start; offset <= range.end;) {
        const end = Math.min(range.end, offset + BLOCK_SIZE - 1);
        let block: Uint8Array;
        if ((response.status === 200 || offset === 0) && bytes.length >= end + 1) block = bytes.subarray(offset, end + 1);
        else {
          const part = await transport.fetch(url, { ...options, range: { start: offset, end } });
          if (part.status !== 206) throw new Error('Source does not support incremental media ranges');
          block = new Uint8Array(await part.arrayBuffer());
          if (block.length !== end - offset + 1) throw new Error('Incomplete media range');
        }
        await send(range.partial ? 206 : 200, headers, block, end === range.end);
        offset = end + 1;
      }
    } catch {
      if (!controller.signal.aborted) {
        await plugin.peerMediaResponse({ id: event.id, token, status: started ? 502 : 416,
          headers: { 'Content-Length': '0' }, body: '', final: true }).catch(() => {});
      }
    } finally { requests.delete(event.id); }
  };

  const listener = await plugin.addListener('peerMediaRequest', event => { void serve(event); });
  const cancelListener = await plugin.addListener('peerMediaCancel', event => {
    if (event.token === token) requests.get(event.id)?.abort();
  });
  try {
    const registered = await plugin.registerPeerSource();
    token = registered.token;
    rootUrl = registered.proxyUrl;
    return { url: rootUrl, async close() {
      if (closed) return;
      closed = true;
      for (const controller of requests.values()) controller.abort();
      requests.clear(); resources.clear(); identifiers.clear();
      try { await plugin.unregisterPeerSource({ token }); }
      finally { await Promise.all([listener.remove(), cancelListener.remove()]); }
    } };
  } catch (error) {
    await Promise.all([listener.remove(), cancelListener.remove()]);
    throw error;
  }
}
