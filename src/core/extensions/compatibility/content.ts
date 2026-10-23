import { throwCompatibilityAbort, awaitCompatibility } from './abort';
import { compatibilityRequest, compatibilitySources, compatibilityNamespace, compatibilityLabel, COMPATIBILITY_ECOSYSTEMS, type CompatibilitySource } from './client';
import type { CustomHomeData, CustomInfoData, CustomReadData, CustomSearchData, CustomSourceEntry, CustomWatchData } from '@/core/content/custom-source-runtime';
import { confidentCompatibilityTitle } from './matching';
import { proxyRemoteSources, proxyRemoteUrl } from '../remote/media';
import { recordSourceReport, recordSourceReports, type ExtensionSourceReport } from '../remote/diagnostics';
import type { MangaReadResponse } from '@/types/manga';
import { Capacitor } from '@capacitor/core';
import { runCompatibilitySources } from './scheduling';
import { compatibilityProviderKey, compatibilityProviderName } from './providers';
import { watchLookupCache } from './lookup-cache';
import { isExplicitExtensionContent, showAdultExtensionContent } from '@/lib/contentSafety';

function sourceIcon(source: CompatibilitySource) {
  if (!['mihon', 'aniyomi'].includes(source.ecosystem) || !/^[\w.]+$/.test(source.packageId)) return;
  try {
    const repository = new URL(source.repository);
    if (repository.protocol !== 'https:') return;
    if (!/\.(json|pb)$/.test(repository.pathname) && !repository.pathname.endsWith('/')) repository.pathname += '/';
    return new URL(`icon/${source.packageId}.png`, repository).href;
  } catch { return; }
}
export async function compatibilityCustomSources(includeDisabled = false): Promise<CustomSourceEntry[]> {
  return (await compatibilitySources().catch(() => [])).filter(s => includeDisabled || s.enabled).map(s => ({
    namespace: compatibilityNamespace(s), id: s.id, extensionId: s.packageId,
    providerGroup: JSON.stringify([s.repository, compatibilityProviderKey(s)]),
    language: s.lang, name: compatibilityProviderName(s), kind: s.kind, nsfw: isExplicitExtensionContent(s),
    catalogMediaType: s.kind === 'watch' ? 'anime' as const : 'manga' as const,
    enabled: s.enabled, description: s.extensionName,
    icon: sourceIcon(s),
  }));
}
async function sourceFor(namespace: string, sourceId: string, signal?: AbortSignal) {
  const ecosystem = COMPATIBILITY_ECOSYSTEMS.find(kind => `compat-${kind}` === namespace);
  if (!ecosystem) throw Error('Unknown local source namespace');
  const source = (await compatibilityRequest<CompatibilitySource[]>({ op: 'sources', ecosystem }, signal)).find(s => s.id === sourceId && s.enabled && compatibilityNamespace(s) === namespace);
  if (!source) throw Error('Extension source is disabled, removed, or unavailable on this device');
  return source;
}
async function contentCall<T>(namespace: string, sourceId: string, op: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const source = await sourceFor(namespace, sourceId, signal);
  return compatibilityRequest<T>({ op, ecosystem: source.ecosystem, sourceId, ...args }, signal);
}
export async function compatibilityHome(namespace: string, sourceId: string, page = 1, signal?: AbortSignal): Promise<CustomHomeData> {
  const data = await contentCall<CustomSearchData>(namespace, sourceId, 'browse', { page }, signal);
  return { sections: [{ title: 'Browse', items: data.results }], hasNextPage: data.hasNextPage };
}
export const compatibilitySearch = (namespace: string, sourceId: string, query: string, page: number, signal?: AbortSignal) => contentCall<CustomSearchData>(namespace, sourceId, 'search', { query, page }, signal);
export const compatibilityInfo = (namespace: string, sourceId: string, id: string, signal?: AbortSignal) => contentCall<CustomInfoData>(namespace, sourceId, 'info', { id }, signal);
export async function compatibilityWatch(namespace: string, sourceId: string, id: string, episodeId: string): Promise<CustomWatchData> {
  const result = await contentCall<CustomWatchData>(namespace, sourceId, 'resolve', { id, episodeId });
  return { sources: await proxyRemoteSources(result.sources) };
}
export async function compatibilityRead(namespace: string, sourceId: string, chapterId: string): Promise<CustomReadData> {
  const { extensionOfflinePages } = await import('./downloads');
  const offline = await extensionOfflinePages(sourceId, chapterId);
  if (offline) return offline;
  const result = await contentCall<CustomReadData>(namespace, sourceId, 'pages', { chapterId });
  return { pages: await Promise.all(result.pages.map(async p => ({ ...p, proxiedImageUrl: await proxyRemoteUrl(p.imageUrl, p.headers || {}, Capacitor.isNativePlatform()) }))) };
}
export async function searchCompatibility(query: string, kind?: 'watch' | 'read', upstreamSignal?: AbortSignal) {
  const sources = (await compatibilitySources(upstreamSignal, kind).catch(() => [])).filter(s => s.enabled && (!kind || s.kind === kind));
  // Bound concurrent source calls; one failed provider never suppresses its peers.
  const results: any[] = [];
  await runCompatibilitySources(sources, async (source, signal) => {
      try {
        const data = await compatibilityRequest<CustomSearchData>({ op: 'search', sourceId: source.id, query, page: 1 }, signal);
        for (const item of data.results.filter(item => showAdultExtensionContent() || (!isExplicitExtensionContent(source) && !isExplicitExtensionContent(item)))) results.push({ ...item, sourceId: source.id, providerName: sourceLabel(source), type: source.kind === 'watch' ? 'anime' : 'manga',
          route: `/x/${compatibilityNamespace(source)}/${encodeURIComponent(source.id)}/info/${encodeURIComponent(item.id)}` });
      } catch (error) { if (upstreamSignal?.aborted) throw error; }
  }, { signal: upstreamSignal, totalMs: 60000, sourceMs: 25000 });
  // Never deduplicate unrelated titles by name. Each result retains its source route.
  return results;
}
async function matchedTitle(source: CompatibilitySource, titles: string[], signal?: AbortSignal, aliases?: Promise<string[]>) {
  for (const title of [...new Set(titles.filter(Boolean))].slice(0, 4)) {
    throwCompatibilityAbort(signal);
    const found = await compatibilityRequest<CustomSearchData>({ op: 'search', sourceId: source.id, query: title, page: 1 }, signal);
    const id = confidentCompatibilityTitle(found.results, title);
    if (id) return id;
  }
  if (aliases) {
    const extra = (await awaitCompatibility(aliases, signal)).filter(title => title && !titles.includes(title));
    if (extra.length) return matchedTitle(source, extra.slice(0, Math.max(0, 4 - titles.length)), signal);
  }
  throw Error('No confident title match; open the extension source to choose the title');
}
const sourceLabel = (source: CompatibilitySource) => `${compatibilityLabel(source.ecosystem)} · ${source.extensionName} · ${compatibilityProviderName(source)}`;
async function episodeIdentity(source: CompatibilitySource, id: string, episode: number | undefined, signal: AbortSignal): Promise<string> {
  const info = await compatibilityRequest<CustomInfoData>({ op: 'info', sourceId: source.id, id }, signal);
  const candidates = info.entries.filter(entry => entry.number === episode);
  if (candidates.length !== 1) throw Error(candidates.length ? 'Episode number is ambiguous across seasons; choose it in the extension source' : 'Requested episode not available in this extension');
  const index = new Map<number, string | null>();
  for (const entry of info.entries) if (typeof entry.number === 'number' && Number.isFinite(entry.number)) index.set(entry.number, index.has(entry.number) ? null : entry.id);
  watchLookupCache().episodes.set(JSON.stringify([source.id, id]), JSON.stringify([...index].filter(([, value]) => value !== null)));
  return candidates[0].id;
}
async function mappedWatchSource(source: CompatibilitySource, titles: string[], episode: number | undefined, signal: AbortSignal, aliases?: Promise<string[]>): Promise<CustomWatchData> {
  const cache = watchLookupCache(), key = JSON.stringify([source.id, titles]);
  let usedCache = false, indexKey = '';
  const resolve = async (fresh: boolean) => {
    const cachedTitle = fresh ? undefined : cache.titles.get(key);
    const id = cachedTitle || await matchedTitle(source, titles, signal, aliases);
    usedCache ||= !!cachedTitle;
    if (!cachedTitle) cache.titles.set(key, id);
    indexKey = JSON.stringify([source.id, id]);
    const index = fresh ? undefined : cache.episodes.get(indexKey);
    const cachedEpisode = index ? (JSON.parse(index) as [number, string][]).find(([number]) => number === episode)?.[1] : undefined;
    usedCache ||= !!cachedEpisode;
    const episodeId = cachedEpisode || await episodeIdentity(source, id, episode, signal);
    throwCompatibilityAbort(signal);
    // Resolve fresh media URLs/headers on every request; never cache stream tokens.
    return compatibilityRequest<CustomWatchData>({ op: 'resolve', sourceId: source.id, id, episodeId }, signal);
  };
  let result: CustomWatchData;
  try { result = await resolve(false); }
  catch (error) {
    if (!usedCache || signal.aborted) throw error;
    cache.titles.delete(key); cache.episodes.delete(indexKey);
    return resolve(true);
  }
  if (usedCache && !result.sources.length) {
    cache.titles.delete(key); cache.episodes.delete(indexKey);
    return resolve(true);
  }
  return result;
}
export async function compatibilityMappedChapters(params: { title?: string; titles?: string[] }) {
  const sources = (await compatibilitySources(undefined, 'read').catch(() => [])).filter(s => s.enabled && s.kind === 'read');
  const chapters: any[] = [], failedProviders: string[] = [];
  const titles = [params.title || '', ...(params.titles || [])].filter(Boolean);
  if (!titles.length) return { chapters, failedProviders, providersAvailable: [] as string[] };
  const skipped = await runCompatibilitySources(sources, async (source, signal) => {
    try {
      throwCompatibilityAbort(signal);
      const id = await matchedTitle(source, titles, signal);
      const info = await compatibilityRequest<CustomInfoData>({ op: 'chapters', sourceId: source.id, id }, signal);
      for (const entry of info.entries) if (entry.number != null && Number.isFinite(entry.number)) chapters.push({ number: entry.number, title: entry.label, sources: [{ provider: source.id, providerName: sourceLabel(source), chapterKey: `${source.id}:${entry.id}`, providerChapterId: entry.id, language: source.lang, scanlator: null, releaseDate: null }] });
    } catch { failedProviders.push(source.id); }
  });
  failedProviders.push(...skipped.map(source => source.id));
  return { chapters, failedProviders, providersAvailable: sources.map(s => s.id) };
}
export async function compatibilityMappedPages(params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number }): Promise<MangaReadResponse> {
  const ecosystem = COMPATIBILITY_ECOSYSTEMS.find(kind => params.extensionId.startsWith(`compat-${kind}-`));
  const source = ecosystem ? await sourceFor(`compat-${ecosystem}`, params.extensionId).catch(() => undefined) : undefined;
  if (!source || source.kind !== 'read') return { success: false, message: 'Extension source is disabled or removed' };
  const chapterId = params.providerChapterId || params.chapterKey.slice(source.id.length + 1);
  const result = await compatibilityRead(compatibilityNamespace(source), source.id, chapterId);
  return { success: result.pages.length > 0, data: { pages: result.pages.map(p => ({ ...p, proxiedImageUrl: p.proxiedImageUrl || null, width: null, height: null })), chapter: { chapterKey: params.chapterKey, anilistId: params.anilistId || 0, provider: source.id, providerChapterId: chapterId, number: null, title: null, language: source.lang } } };
}
export async function compatibilityMappedStreams(options: { title?: string; titles?: string[]; titleAliases?: Promise<string[]>; episode?: number; dub?: boolean; sourceIds?: string[] }, upstreamSignal?: AbortSignal, onReport?: (report: ExtensionSourceReport) => void, onSources?: (sources: any[]) => void) {
  const selected = options.sourceIds ? new Set(options.sourceIds) : undefined;
  const sources = watchLookupCache().order.sort((await compatibilitySources(upstreamSignal, 'watch').catch(() => [])).filter(s => s.enabled && s.kind === 'watch' && (showAdultExtensionContent() || !isExplicitExtensionContent(s)) && (!selected || selected.has(s.id))));
  const output: any[] = [];
  const sourceReports = new Map<string, ExtensionSourceReport>();
  const providerSources = new Map<string, CompatibilitySource[]>();
  for (const source of sources) { const key = compatibilityProviderKey(source), group = providerSources.get(key) || []; group.push(source); providerSources.set(key, group); }
  const reportSource = (source: CompatibilitySource, value: ExtensionSourceReport) => {
    sourceReports.set(source.id, value);
    const key = compatibilityProviderKey(source);
    const reports = providerSources.get(key)!.flatMap(row => sourceReports.has(row.id) ? [sourceReports.get(row.id)!] : []);
    const count = reports.reduce((sum, row) => sum + row.count, 0);
    const errors = [...new Set(reports.filter(row => row.status !== 'skipped').map(row => row.error).filter(Boolean))];
    const report: ExtensionSourceReport = { ...value, provider: key, name: sourceLabel(source), count, subtitleCount: reports.reduce((sum, row) => sum + (row.subtitleCount || 0), 0), durationMs: Math.max(...reports.map(row => row.durationMs)), status: count ? errors.length ? 'partial' : 'ok' : reports.some(row => row.status === 'timeout') ? 'timeout' : value.status, error: errors.join('; ') || undefined };
    report.skippedSourceIds = reports.filter(row => row.status === 'skipped').map(row => row.provider);
    if (reports.every(row => row.status === 'skipped')) report.error = value.error;
    recordSourceReport(report); onReport?.(report);
  };
  // The initial bridge cannot certify a provider's audio track. Never substitute
  // an unverified stream for an explicit dub request.
  if (!options.title || options.dub) return output;
  const queued: ExtensionSourceReport[] = [...providerSources].map(([provider, group]) => ({ provider, name: sourceLabel(group[0]), ecosystem: group[0].ecosystem, kind: 'anime', status: 'queued', count: 0, durationMs: 0 }));
  recordSourceReports(queued);
  for (const report of queued) onReport?.(report);
  const skipped = await runCompatibilitySources(sources, async (source, signal) => {
    const started = performance.now();
    const report = (value: ExtensionSourceReport) => reportSource(source, value);
    try {
      throwCompatibilityAbort(signal);
      const resolved = await mappedWatchSource(source, [...new Set([options.title!, ...(options.titles || [])].filter(Boolean))].slice(0, 4), options.episode, signal, options.titleAliases);
      const playable = await proxyRemoteSources(resolved.sources);
      throwCompatibilityAbort(signal);
      output.push(...playable.map(s => ({ ...s, providerKey: compatibilityProviderKey(source), providerName: compatibilityProviderName(source), extensionId: source.packageId, extensionName: source.extensionName, ecosystem: source.ecosystem, compatibilitySourceId: source.id, source: sourceLabel(source), language: s.audioLanguage || s.language || source.lang })));
      if (playable.length) watchLookupCache().order.record(source.id, true, performance.now() - started);
      report({ provider: source.id, name: sourceLabel(source), ecosystem: source.ecosystem, kind: 'anime', status: playable.length ? 'ok' : 'empty', count: playable.length, subtitleCount: playable.reduce((sum, stream) => sum + (stream.subtitles?.length || 0), 0), durationMs: Math.round(performance.now() - started) });
      onSources?.([...output]);
    } catch (e) { if (upstreamSignal?.aborted) throw e; const message = e instanceof Error ? e.message : 'Provider failed'; const unmatched = /No confident title match|episode.*(?:ambiguous|not available)/i.test(message); if (!unmatched) watchLookupCache().order.record(source.id, false, performance.now() - started); report({ provider: source.id, name: sourceLabel(source), ecosystem: source.ecosystem, kind: 'anime', status: signal.aborted ? 'timeout' : unmatched ? 'unmatched' : 'error', count: 0, durationMs: Math.round(performance.now() - started), error: message }); }
  }, { signal: upstreamSignal, totalMs: null });
  for (const source of skipped) reportSource(source, { provider: source.id, name: sourceLabel(source), ecosystem: source.ecosystem, kind: 'anime', status: 'skipped', count: 0, durationMs: 0, error: 'Not searched in this batch; select Search remaining sources to continue' });
  return output;
}
