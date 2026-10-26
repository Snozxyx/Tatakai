import { EXTENSION_INSTALLED_EVENT } from '../ecosystems';
import type { WatchExtensionBatch } from '../compatibility/watch-batches';
import type { CustomSourceEntry, CustomHomeData, CustomSearchData, CustomInfoData, CustomWatchData, CustomReadData } from '@/core/content/custom-source-runtime';
import type { MangaReadResponse } from '@/types/manga';
import type { NovelContentResponse } from '@/types/novel';
import { readApiResponse } from '../../../../tatakai-server/src/api-response.mjs';

const KEY = 'tatakai_extension_servers_v1';
export interface ServerConnection { id: string; serverId: string; url: string; name: string; token: string; enabled: boolean; logoUrl?: string }
export interface ServerSource { id: string; extensionId: string; name: string; ecosystem: string; kind: 'watch' | 'read' | 'novel'; enabled: boolean; available: boolean; reason: string; languages: string[] }
export function listServers(): ServerConnection[] {
  try { const rows = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(rows) ? rows.filter(row => row && typeof row.url === 'string' && typeof row.token === 'string') : []; } catch { return []; }
}
export function saveServers(rows: ServerConnection[]) { localStorage.setItem(KEY, JSON.stringify(rows)); window.dispatchEvent(new Event(EXTENSION_INSTALLED_EVENT)); }
export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw Error('Enter the server’s base HTTP or HTTPS URL without credentials or a path');
  if (location.protocol === 'https:' && url.protocol !== 'https:') throw Error('This website needs an HTTPS server URL. Put your server behind an HTTPS reverse proxy or use a serverless HTTPS deployment.');
  return url.origin;
}
export async function serverRequest<T = any>(server: Pick<ServerConnection, 'url' | 'token'>, path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(server.url + '/api/server/v1' + path, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(server.token ? { authorization: `Bearer ${server.token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (response.status === 401) {
    if (path === '/auth/login') throw Error('Incorrect viewer password. Enter the viewer access password configured on this server, or leave it empty if public access is enabled.');
    if (path === '/auth/pair') throw Error('This pairing code expired or was already used. Generate a new connection link from the server dashboard.');
    throw Error('Server access expired or was revoked. Reconnect with the viewer password.');
  }
  const result = await readApiResponse(response);
  if (!response.ok || !result.success) {
    const code = result.error?.code;
    throw Error(code === 'login_throttled' ? 'Too many login attempts. Wait a minute and try again.' : result.error?.message || `Server request failed (${response.status})`);
  }
  return result.data;
}
export async function connectServer(urlInput: string, password: string, code?: string) {
  const url = normalizeServerUrl(urlInput), provisional = { url, token: '' };
  const health = await serverRequest(provisional, '/health');
  if (health.protocolVersion !== 1) throw Error('This server uses an incompatible protocol. Update Tatakai or the server.');
  if (health.setupRequired) throw Error('Complete setup at the server URL before connecting Tatakai.');
  const auth = await serverRequest(provisional, code ? '/auth/pair' : '/auth/login', code ? { code, label: 'Tatakai client' } : { password, role: 'viewer', label: 'Tatakai client' });
  const previous = listServers(), existing = previous.find(row => row.serverId === health.serverId && row.url === url);
  const connection: ServerConnection = { id: existing?.id || crypto.randomUUID(), serverId: health.serverId, name: existing?.name || health.name, url, token: auth.token, enabled: true, logoUrl: health.logoUrl || undefined };
  saveServers([...previous.filter(row => row.id !== connection.id), connection]);
  return connection;
}
export function connectionFor(namespace: string) {
  const server = listServers().find(row => `server-${row.id}` === namespace && row.enabled);
  if (!server) throw Error('This server is disabled or disconnected'); return server;
}
export function serverInvoke(namespace: string, sourceId: string, op: string, args: Record<string, unknown>, signal?: AbortSignal) {
  return serverRequest(connectionFor(namespace), '/invoke', { sourceId, op, args, progressive: ['chapters','novelChapters'].includes(op) }, signal);
}
export async function resolveServerSources(options: Record<string, unknown>, signal?: AbortSignal, progress?: (batch: WatchExtensionBatch) => void): Promise<WatchExtensionBatch> {
  const batches = new Map<string, WatchExtensionBatch>();
  const merged = (): WatchExtensionBatch => ({ sources: [...batches.values()].flatMap(row => row.sources), subtitles: [...batches.values()].flatMap(row => row.subtitles), statuses: [...batches.values()].flatMap(row => row.statuses) });
  await Promise.all(listServers().filter(row => row.enabled).map(async server => {
    try {
      const response = await fetch(server.url + '/api/server/v1/resolve', { method: 'POST', headers: { authorization: `Bearer ${server.token}`, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify(options), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), referrerPolicy: 'no-referrer' });
      if (!response.ok) throw Error(response.status === 401 ? 'Reconnect this server: access expired or revoked' : `Server unavailable (${response.status})`);
      const reader = response.body!.getReader(), decoder = new TextDecoder(); let pending = '';
      try { while (true) { const { value, done } = await reader.read(); pending += decoder.decode(value, { stream: !done }); if (pending.length > 8 * 1024 * 1024) throw Error('Server response exceeded limit'); const lines = pending.split('\n'); pending = lines.pop()!; for (const line of lines) if (line) {
        const batch = JSON.parse(line) as WatchExtensionBatch;
        batch.sources = batch.sources.map(source => ({ ...source, extensionServerName: server.name,
          sourceName: source.sourceName || source.source || source.server || source.providerName,
          extensionName: source.extensionName || source.providerName }));
        batches.set(server.id, batch); progress?.(merged());
      } if (done) break; } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (error) {
      if (signal?.aborted) return;
      const previous = batches.get(server.id) || { sources: [], subtitles: [], statuses: [] };
      batches.set(server.id, { ...previous, statuses: [...previous.statuses, { provider: 'server-' + server.id, name: server.name, ecosystem: 'tatakai', kind: 'anime', status: 'error', count: 0, durationMs: 0, error: error instanceof Error ? error.message : 'Server unavailable' }] });
      progress?.(merged());
    }
  }));
  signal?.throwIfAborted(); return merged();
}
export async function serverCustomSources(): Promise<CustomSourceEntry[]> {
  const results = await Promise.allSettled(listServers().filter(row => row.enabled).map(async server => {
    const sources = await serverRequest<ServerSource[]>(server, '/sources');
    return sources.filter(source => source.available && source.kind !== 'novel').map(source => ({ namespace: `server-${server.id}`, id: source.id,
      extensionId: source.extensionId, name: `${source.name} · ${server.name}`, kind: source.kind, description: source.ecosystem, enabled: true } as CustomSourceEntry));
  }));
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}
const cards = (items: any[]) => items.map(item => ({ ...item, id: String(item.id || item.url), title: item.title || item.name, image: item.image || item.poster }));
export async function serverCustomSearch(namespace: string, sourceId: string, query: string, page: number, signal?: AbortSignal): Promise<CustomSearchData> {
  const result = await serverInvoke(namespace, sourceId, query ? 'search' : 'browse', { query, page, skip: (page - 1) * 100 }, signal);
  return { results: cards(Array.isArray(result) ? result : result.results || result.metas || []), hasNextPage: !!result.hasNextPage };
}
export async function serverCustomHome(namespace: string, sourceId: string, page: number, signal?: AbortSignal): Promise<CustomHomeData> {
  const result = await serverCustomSearch(namespace, sourceId, '', page, signal); return { sections: [{ title: 'Browse', items: result.results }] };
}
export async function serverCustomInfo(namespace: string, sourceId: string, id: string, signal?: AbortSignal): Promise<CustomInfoData | null> {
  const result = await serverInvoke(namespace, sourceId, 'info', { id, url: id }, signal);
  if (!result) return null;
  return { ...result, id: String(result.id || id), title: result.title || result.name, image: result.image || result.poster,
    entries: (result.entries || result.videos || result.episodes || result.chapters || []).map((entry: any) => ({ ...entry, id: String(entry.id || entry.url), title: entry.title || entry.name, label: entry.label || entry.title || entry.name || `Entry ${entry.number || entry.episode || ''}`, number: entry.number ?? entry.episode })) };
}
export async function serverCustomWatch(namespace: string, sourceId: string, id: string, episodeId: string): Promise<CustomWatchData> {
  const result = await serverInvoke(namespace, sourceId, 'resolve', { id: episodeId || id, url: episodeId || id }); return { sources: Array.isArray(result) ? result : result.sources || [] };
}
export async function serverCustomRead(namespace: string, sourceId: string, chapterId: string): Promise<CustomReadData> {
  let detail: Record<string, unknown> = {};
  try { const decoded = JSON.parse(chapterId); if (decoded && typeof decoded.chapterKey === 'string') detail = decoded; } catch { /* Ordinary source chapter IDs stay unchanged. */ }
  const result = await serverInvoke(namespace, sourceId, 'pages', { id: chapterId, chapterId, url: chapterId, ...detail });
  return { pages: (Array.isArray(result) ? result : result.pages || []).map((page: any, index: number) => ({ pageNumber: index + 1, imageUrl: typeof page === 'string' ? page : page.imageUrl || page.url })) };
}
export async function serverMappedChapters(params: { anilistId?: number; title?: string; titles?: string[] }) {
  const sources = (await serverCustomSources()).filter(source => source.kind === 'read');
  const chapters: any[] = [], failedProviders: string[] = []; let pending = false;
  await Promise.all(sources.map(async source => {
    const provider = `${source.namespace}|${source.id}`;
    try {
      let result: any;
      if (source.description === 'tatakai') result = await serverInvoke(source.namespace, source.id, 'chapters', params);
      else {
      const search = await serverCustomSearch(source.namespace, source.id, params.title || params.titles?.[0] || '', 1);
      const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const titles = [params.title, ...(params.titles || [])].filter(Boolean).map(value => normalize(value!));
      const matches = search.results.filter(item => titles.includes(normalize(item.title)));
      if (matches.length !== 1) throw Error('Select the title from the server catalog to read');
      result = await serverInvoke(source.namespace, source.id, 'chapters', { id: matches[0].id, url: matches[0].id });
      }
      pending ||= result?.partial === true;
      for (const chapter of Array.isArray(result) ? result : result.entries || result.chapters || []) {
        const number = Number(chapter.number ?? chapter.chapter), id = String(chapter.id || chapter.url || '');
        if (!Number.isFinite(number)) continue;
        if (Array.isArray(chapter.sources) && chapter.sources.length) {
          chapters.push({ number, title: chapter.title, sources: chapter.sources.map((entry: any) => {
            const chapterId = JSON.stringify({ chapterKey: entry.chapterKey, provider: entry.provider, providerChapterId: entry.providerChapterId, anilistId: params.anilistId });
            return { ...entry, provider, providerName: `${entry.provider || source.name} · ${source.name}`, chapterKey: `${provider}:${chapterId}`, providerChapterId: chapterId };
          }) }); continue;
        }
        if (!id) continue;
        chapters.push({ number, title: chapter.label || chapter.title || chapter.name, sources: [{ provider, providerName: source.name, chapterKey: `${provider}:${id}`, providerChapterId: id, language: null, scanlator: null, releaseDate: null }] });
      }
    } catch { failedProviders.push(provider); }
  }));
  return { chapters, failedProviders, pending, providersAvailable: sources.map(source => `${source.namespace}|${source.id}`) };
}
export async function serverMappedPages(params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number }): Promise<MangaReadResponse> {
  const [namespace, sourceId] = params.extensionId.split('|');
  const chapterId = params.providerChapterId || params.chapterKey.slice(params.extensionId.length + 1);
  const result = await serverCustomRead(namespace, sourceId, chapterId);
  return { success: result.pages.length > 0, data: { pages: result.pages.map(page => ({ ...page, proxiedImageUrl: page.imageUrl, width: null, height: null })), chapter: { chapterKey: params.chapterKey, anilistId: params.anilistId || 0, provider: params.extensionId, providerChapterId: chapterId, number: null, title: null, language: null } } };
}

export async function serverNovelChapters(params: { anilistId?: number; title?: string; titles?: string[]; fullScan?: boolean }) {
  const results = await Promise.all(listServers().filter(row => row.enabled).map(async server => {
    const chapters: any[] = [], providersAvailable: string[] = [], failedProviders: string[] = []; let pending = false;
    try {
      const sources = await serverRequest<ServerSource[]>(server, '/sources');
      await Promise.all(sources.filter(source => source.available && source.kind === 'novel').map(async source => {
        const provider = `server-${server.id}|${source.id}`;
        try {
          const result = await serverInvoke(`server-${server.id}`, source.id, 'novelChapters', params);
          pending ||= result?.partial === true;
          providersAvailable.push(provider);
          for (const chapter of Array.isArray(result) ? result : result.chapters || []) {
            const entries = Array.isArray(chapter.sources) && chapter.sources.length ? chapter.sources : [chapter];
            chapters.push({ ...chapter, sources: entries.map((entry: any) => {
              const detail = JSON.stringify({ chapterKey: entry.chapterKey, provider: entry.provider, providerChapterId: entry.providerChapterId });
              return { ...entry, provider, providerName: `${entry.providerName || entry.provider || source.name} · ${server.name}`,
                chapterKey: `${provider}:${detail}`, providerChapterId: detail };
            }) });
          }
        } catch { failedProviders.push(provider); }
      }));
    } catch { failedProviders.push(`server-${server.id}`); }
    return { chapters, providersAvailable, failedProviders, pending };
  }));
  return { pending: results.some(row => row.pending), chapters: results.flatMap(row => row.chapters), providersAvailable: results.flatMap(row => row.providersAvailable), failedProviders: results.flatMap(row => row.failedProviders) };
}

export async function serverNovelContent(params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number }): Promise<NovelContentResponse> {
  const [namespace, sourceId] = params.extensionId.split('|');
  const encoded = params.providerChapterId || params.chapterKey.slice(params.extensionId.length + 1);
  const detail = JSON.parse(encoded);
  if (typeof detail.chapterKey !== 'string') throw Error('This chapter has no source key. Reload the novel’s chapter list.');
  const result = await serverInvoke(namespace, sourceId, 'novelContent', { ...detail, anilistId: params.anilistId });
  const paragraphs = (result.paragraphs || []).map((paragraph: any, index: number) => ({ index, text: String(typeof paragraph === 'string' ? paragraph : paragraph.text || '').trim() })).filter((paragraph: any) => paragraph.text);
  return { success: paragraphs.length > 0, data: { paragraphs, chapter: { chapterKey: params.chapterKey, anilistId: params.anilistId || 0,
    provider: params.extensionId, providerChapterId: encoded, number: result.number ?? null, title: result.title ?? null, language: result.language ?? null },
    readMeta: { provider: params.extensionId, fetchedAt: new Date().toISOString(), fallbackUsed: false } } };
}
