import { invokeRemote, listRemoteExtensions, type RemoteExtension } from './installed';
import { fetchExtensionJson } from './transport';
import { normalizeStremioStream, stremioResourceUrl, supportsResource } from './stremio';
import { proxyRemoteSources, proxyRemoteUrl } from './media';
import { matchRemoteTitle } from './resolve';
import { recordSourceReport } from './diagnostics';
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import type { CustomSourceEntry, CustomHomeData, CustomSearchData, CustomInfoData, CustomWatchData } from '@/core/content/custom-source-runtime';

export function customDescriptors(row: RemoteExtension): CustomSourceEntry[] {
  if (row.enabled && row.ecosystem === 'seanime' && row.manifest.type === 'custom-source') {
    return (['anime', 'manga'] as const).filter(type => row.manifest.customSettings?.[type === 'anime' ? 'supportsAnime' : 'supportsManga']).map(type => ({ namespace: row.id, extensionId: row.id, id: type, kind: type === 'anime' ? 'watch' : 'read', catalogMediaType: type, nsfw: isExplicitExtensionContent(row.manifest), name: `${row.manifest.name} · ${type}`, icon: row.manifest.icon, description: row.manifest.description }));
  }
  if (!row.enabled || row.ecosystem !== 'stremio' || !Array.isArray(row.manifest.catalogs)) return [];
  const resources = (row.manifest.resources || []).map((r: any) => typeof r === 'string' ? r : r.name);
  if (!resources.includes('meta') || !resources.includes('stream')) return [];
  return [...new Set<string>(row.manifest.catalogs.map((c: any) => c.type).filter(Boolean))].map(type => ({
    namespace: row.id, extensionId: row.id, id: type, kind: 'watch', name: `${row.manifest.name} · ${type}`,
    icon: row.manifest.logo, description: row.manifest.description, nsfw: isExplicitExtensionContent(row.manifest),
  }));
}
export async function listRemoteCustomSources() {
  return (await listRemoteExtensions()).flatMap(customDescriptors);
}
export async function remoteCustomRow(namespace: string): Promise<RemoteExtension | null> {
  if (!/^(stremio|seanime)-/.test(namespace)) return null;
  return (await listRemoteExtensions()).find(r => r.id === namespace && r.enabled && customDescriptors(r).length) || null;
}
const card = (meta: any) => ({ id: String(meta.id), title: String(meta.name || meta.id), image: meta.poster, subtitle: meta.releaseInfo, badge: meta.type, nsfw: isExplicitExtensionContent(meta), genres: meta.genres });
async function catalog(row: RemoteExtension, type: string, entry: any, query?: string, page = 1) {
  const extras = [];
  if (query) extras.push(`search=${encodeURIComponent(query)}`);
  if (page > 1 && entry.extra?.some((e: any) => e.name === 'skip')) extras.push(`skip=${(page - 1) * 100}`);
  const url = new URL(stremioResourceUrl(row.manifestUrl, 'catalog', type, entry.id));
  if (extras.length) url.pathname = url.pathname.replace(/\.json$/, `/${extras.join('&')}.json`);
  const result = await fetchExtensionJson(url.href);
  if (!Array.isArray(result.metas)) throw Error('Invalid custom catalog response');
  return result.metas.filter((m: any) => m?.id && m?.name).map(card);
}
export async function remoteCustomHome(row: RemoteExtension, type: string): Promise<CustomHomeData> {
  if (row.ecosystem === 'seanime') { const response = await remoteCustomSearch(row, type, '', 1); return { sections: [{ title: row.manifest.name, items: response.results }] }; }
  const catalogs = row.manifest.catalogs.filter((c: any) => c.type === type && !c.extra?.some((e: any) => e.isRequired));
  const sections = await Promise.allSettled(catalogs.map(async (c: any) => ({ title: c.name || row.manifest.name, items: await catalog(row, type, c) })));
  const usable = sections.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  if (!usable.length && sections.some(r => r.status === 'rejected')) throw (sections.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
  return { sections: usable };
}
export async function remoteCustomSearch(row: RemoteExtension, type: string, query: string, page: number): Promise<CustomSearchData> {
  if (row.ecosystem === 'seanime') { const result = await invokeRemote(row, 'remoteCustom', { method: type === 'anime' ? 'listAnime' : 'listManga', args: [query, page, 24] });
    if (!Array.isArray(result?.media)) throw Error('Invalid Seanime custom-source list');
    return { results: result.media.filter((m: any) => m?.id != null).map(seanimeCard), hasNextPage: result.page < result.totalPages }; }
  const catalogs = row.manifest.catalogs.filter((c: any) => c.type === type && c.extra?.some((e: any) => e.name === 'search') && (page === 1 || c.extra.some((e: any) => e.name === 'skip')));
  const results = await Promise.allSettled(catalogs.map((c: any) => catalog(row, type, c, query, page)));
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (!items.length && results.some(r => r.status === 'rejected')) throw (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
  return { results: [...new Map(items.map(m => [m.id, m])).values()], hasNextPage: items.length >= 100 && catalogs.some((c: any) => c.extra?.some((e: any) => e.name === 'skip')) };
}
export async function remoteCustomInfo(row: RemoteExtension, type: string, id: string): Promise<CustomInfoData | null> {
  if (row.ecosystem === 'seanime') return seanimeCustomInfo(row, type, id);
  if (!supportsResource(row.manifest as any, 'meta', type, id)) throw Error('Metadata resource does not support this custom ID');
  const { meta } = await fetchExtensionJson(stremioResourceUrl(row.manifestUrl, 'meta', type, id));
  if (!meta) return null;
  return { id: String(meta.id || id), title: meta.name, image: meta.poster, description: meta.description,
    meta: { Type: type, ...(meta.releaseInfo ? { Released: meta.releaseInfo } : {}) },
    entries: meta.videos?.length ? meta.videos.filter((v: any) => v.id).map((v: any) => ({ id: String(v.id), label: v.title || `Season ${v.season || 1} · Episode ${v.episode || ''}`, number: v.episode })) : [{ id, label: 'Watch' }] };
}
export async function remoteCustomWatch(row: RemoteExtension, type: string, episodeId: string): Promise<CustomWatchData> {
  if (row.ecosystem === 'seanime') { const entry = decodeEntry(episodeId); const provider = await entryProvider(entry, 'onlinestream-provider');
    const sources = await proxyRemoteSources((await invokeRemote(provider, 'remoteResolve', { providerType: provider.manifest.type, titleId: entry.titleId, episode: entry.number })).map((s: any) => ({ ...s, providerKey: provider.id, providerName: provider.manifest.name, source: provider.manifest.name }))); return { sources }; }
  const started = performance.now();
  try {
    if (!supportsResource(row.manifest as any, 'stream', type, episodeId)) throw Error('Stream resource does not support this custom ID');
    const response = await fetchExtensionJson(stremioResourceUrl(row.manifestUrl, 'stream', type, episodeId));
    const sources = await proxyRemoteSources((response.streams || []).map((s: any) => normalizeStremioStream(s, row.id, row.manifest.name)).filter(Boolean));
    recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'custom', status: sources.length ? 'ok' : 'empty', count: sources.length, durationMs: Math.round(performance.now() - started) });
    const subtitles: any[] = [];
    for (const addon of (await listRemoteExtensions()).filter(r => r.enabled && r.ecosystem === 'stremio')) {
      if (!supportsResource(addon.manifest as any, 'subtitles', type, episodeId)) continue;
      try { const response = await fetchExtensionJson(stremioResourceUrl(addon.manifestUrl, 'subtitles', type, episodeId));
        subtitles.push(...(response.subtitles || []).filter((s: any) => /^https?:\/\//i.test(s.url)).map((s: any) => ({ url: s.url, language: s.lang, lang: s.lang, label: `${s.lang || 'Subtitle'} · ${addon.manifest.name}` })));
      } catch (error) { recordSourceReport({ provider: addon.id, name: addon.manifest.name, ecosystem: 'stremio', kind: 'custom', count: 0, subtitleCount: 0, durationMs: 0, status: 'error', error: String(error) }); }
    }
    return { sources: sources.map(s => ({ ...s, subtitles: [...new Map([...(s.subtitles || []), ...subtitles].map(t => [t.url, t])).values()] })) };
  } catch (error) {
    recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'custom', status: 'error', count: 0, durationMs: Math.round(performance.now() - started), error: String(error) }); throw error;
  }
}

const seanimeCard = (media: any) => ({ id: String(media.id), title: media.title?.userPreferred || media.title?.english || media.title?.romaji || media.title?.native || String(media.id), image: media.coverImage?.large || media.coverImage?.medium, subtitle: media.format, nsfw: isExplicitExtensionContent(media), genres: media.genres });
function decodeEntry(value: string): any { try { const entry = JSON.parse(value); if (!entry.provider || !entry.titleId) throw Error(); return entry; } catch { throw Error('Invalid custom-source entry'); } }
async function entryProvider(entry: any, type: string) { const row = (await listRemoteExtensions()).find(r => r.enabled && r.id === entry.provider && r.manifest.type === type); if (!row) throw Error('Selected content provider is disabled or removed'); return row; }
async function seanimeCustomInfo(row: RemoteExtension, type: string, id: string): Promise<CustomInfoData | null> {
  const localId = Number(id); if (!Number.isSafeInteger(localId) || localId < 0) throw Error('Invalid custom media ID');
  const detail = await invokeRemote(row, 'remoteCustom', { method: type === 'anime' ? 'getAnimeDetails' : 'getMangaDetails', args: [localId] });
  const media = detail?.Media || detail?.media || detail;
  if (!media?.title) return null;
  const item = seanimeCard(media); const entries: any[] = [];
  const providers = (await listRemoteExtensions()).filter(r => r.enabled && r.ecosystem === 'seanime' && r.manifest.type === (type === 'anime' ? 'onlinestream-provider' : 'manga-provider'));
  await Promise.all(providers.map(async provider => {
    const started = performance.now(); let count = 0;
    try {
      // Custom IDs stay local; title matching must not treat them as AniList IDs.
      const titleId = await matchRemoteTitle(provider, { query: item.title, media: { englishTitle: media.title.english, romajiTitle: media.title.romaji, nativeTitle: media.title.native, synonyms: media.synonyms || [] } });
      const upstream = await invokeRemote(provider, type === 'anime' ? 'remoteEpisodes' : 'remoteChapters', { titleId });
      if (!Array.isArray(upstream)) throw Error('Invalid custom content response');
      for (const part of upstream) {
        const number = Number(type === 'anime' ? part.number : part.chapter ?? part.number); if (!Number.isFinite(number) || !part.id) continue;
        entries.push({ id: JSON.stringify({ provider: provider.id, titleId, partId: String(part.id), number }), number, label: `${type === 'anime' ? 'Episode' : 'Chapter'} ${number} · ${provider.manifest.name}` }); count++;
      }
      recordSourceReport({ provider: provider.id, name: provider.manifest.name, ecosystem: 'seanime', kind: 'custom', count, status: count ? 'ok' : 'empty', durationMs: Math.round(performance.now() - started) });
    } catch (error) { recordSourceReport({ provider: provider.id, name: provider.manifest.name, ecosystem: 'seanime', kind: 'custom', count: 0, status: 'error', durationMs: Math.round(performance.now() - started), error: String(error) }); }
  }));
  return { ...item, description: media.description, meta: { Type: type, Source: row.manifest.name }, entries: entries.sort((a, b) => a.number - b.number || a.label.localeCompare(b.label)) };
}
export async function remoteCustomRead(row: RemoteExtension, chapterId: string) {
  if (row.ecosystem !== 'seanime') throw Error('Stremio does not provide manga pages');
  const entry = decodeEntry(chapterId); const provider = await entryProvider(entry, 'manga-provider');
  const result = await invokeRemote(provider, 'remotePages', { chapterId: entry.partId });
  if (!Array.isArray(result)) throw Error('Invalid manga page response');
  const pages = await Promise.all([...result].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).map(async (page: any, index: number) => {
    const imageUrl = typeof page === 'string' ? page : page.url;
    if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) throw Error('Invalid page URL');
    return { pageNumber: index + 1, imageUrl, proxiedImageUrl: await proxyRemoteUrl(imageUrl, page.headers), headers: page.headers };
  }));
  recordSourceReport({ provider: provider.id, name: provider.manifest.name, ecosystem: 'seanime', kind: 'custom', count: pages.length, status: pages.length ? 'ok' : 'empty', durationMs: 0 }); return { pages };
}
