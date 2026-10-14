import { searchStremioTargets } from './stremio-search';
import { automaticTitleMatch, titleSearchQueries, type TitleMatchOptions } from './title-match';
import { proxyRemoteSources, proxyRemoteUrl } from './media';
import { languageLabel } from './metadata';
import { recordSourceReport, type ExtensionSourceReport } from './diagnostics';
import { fetchAniZipMapping } from '@/lib/mapping/anizip';
import { fetchExtensionJson } from './transport';
import { supportsResource, stremioResourceUrl, normalizeStremioStream, type StremioManifest } from './stremio';
import { listRemoteExtensions, invokeRemote, updateRemoteExtension, type RemoteExtension } from './installed';

export async function matchRemoteTitle(row: RemoteExtension, opts: TitleMatchOptions, signal?: AbortSignal): Promise<string> {
  const key = String(opts.media?.id || opts.query) + (typeof opts.dub === 'boolean' ? `:${opts.dub ? 'dub' : 'sub'}` : '');
  if (row.matches[key]) return row.matches[key];
  const candidates: any[] = [];
  let selected: string | null = null;
  for (const query of titleSearchQueries(opts).slice(0, 4)) {
    signal?.throwIfAborted();
    const results = await invokeRemote(row, 'remoteSearch', { ...opts, query });
    if (!Array.isArray(results)) throw new Error('Invalid provider search response');
    candidates.push(...results);
    selected = automaticTitleMatch(candidates, opts);
    if (selected) break;
  }
  signal?.throwIfAborted();
  if (!selected) throw new Error('No matching title found automatically');
  row.matches[key] = selected; await updateRemoteExtension(row, false); return selected;
}
export async function resolveRemoteSources(options: { anilistId?: number; title?: string; episode?: number; dub?: boolean }, signal?: AbortSignal): Promise<{ sources: any[]; subtitles: any[]; statuses: ExtensionSourceReport[] }> {
  const rows = (await listRemoteExtensions()).filter(row => row.enabled && (row.ecosystem === 'stremio' || ['onlinestream-provider', 'anime-torrent-provider'].includes(row.manifest.type)));
  const mapping = rows.length ? await fetchAniZipMapping(options.anilistId, { signal }).catch(() => null) : null;
  // Share catalog/metadata lookups across installed addons in this request.
  const searches = new Map<string, Promise<any>>();
  const searchJson = (url: string) => { if (!searches.has(url)) searches.set(url, fetchExtensionJson(url, signal)); return searches.get(url)!; };
  const subtitles: any[] = [];
  const statuses: ExtensionSourceReport[] = [];
  const report = (row: RemoteExtension, started: number, status: string, count: number, subtitleCount: number, error?: string, lookup?: 'mapping' | 'catalog-search', attempts?: number) => {
    const item: ExtensionSourceReport = { provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'anime', status, count, subtitleCount, durationMs: Math.round(performance.now() - started), lookup, attempts, error: error?.replace(/https?:\/\/[^\s)]+/gi, '[URL]').slice(0, 300) };
    recordSourceReport(item); statuses.push(item);
  };
  const settled = await Promise.all(rows.map(async row => {
    const started = performance.now(); let subtitleCount = 0; let subtitleError: string | undefined; let lookup: 'mapping' | 'catalog-search' | undefined; let attempts = 0;
    try {
      signal?.throwIfAborted();
      let sources: any[];
      if (row.ecosystem === 'stremio') {
        const imdbId = mapping?.ids.imdbId;
        const movie = mapping?.ids.type?.toLowerCase() === 'movie';
        const ep = mapping?.byNumber.get(options.episode || 1);
        const manifest = row.manifest as StremioManifest;
        const mapped = imdbId && /^tt\d+$/.test(imdbId) && (movie || (ep?.seasonNumber != null && ep?.seasonEpisodeNumber != null));
        const mappedTarget = mapped ? { type: movie ? 'movie' : 'series', id: movie ? imdbId : `${imdbId}:${ep!.seasonNumber}:${ep!.seasonEpisodeNumber}` } : null;
        const useMapped = mappedTarget && (supportsResource(manifest, 'stream', mappedTarget.type, mappedTarget.id) || supportsResource(manifest, 'subtitles', mappedTarget.type, mappedTarget.id));
        lookup = useMapped ? 'mapping' : 'catalog-search';
        const targets = useMapped ? [{ type: movie ? 'movie' : 'series', id: movie ? imdbId : `${imdbId}:${ep!.seasonNumber}:${ep!.seasonEpisodeNumber}` }]
          : await searchStremioTargets(row, options, mapping, searchJson, signal);
        let { type, id } = targets[0];
        let response: any = { streams: [] }; let lastError: unknown; let answered = false;
        for (const target of targets) {
          signal?.throwIfAborted();
          if (!supportsResource(manifest, 'stream', target.type, target.id)) continue;
          try {
            attempts++;
            const trial = await fetchExtensionJson(stremioResourceUrl(row.manifestUrl, 'stream', target.type, target.id), signal);
            if (!Array.isArray(trial.streams)) throw Error('Invalid stream response');
            answered = true; response = trial; ({ type, id } = target);
            if (trial.streams.length) break;
          } catch (error) { lastError = error; }
        }
        if (!answered && lastError) throw lastError;
        if (!Array.isArray(response.streams)) throw new Error('Invalid stream response');
        sources = response.streams.map((s: any) => normalizeStremioStream(s, row.id, row.manifest.name)).filter(Boolean);
        if (supportsResource(manifest, 'subtitles', type, id)) {
          try {
            const subs = await fetchExtensionJson(stremioResourceUrl(row.manifestUrl, 'subtitles', type, id), signal);
            const tracks = await Promise.all((subs.subtitles || []).filter((s: any) => typeof s.url === 'string' && /^https?:\/\//i.test(s.url)).map(async (s: any) => ({ url: await proxyRemoteUrl(s.url, s.headers), language: s.lang, lang: s.lang, label: `${languageLabel(s.lang)} · ${row.manifest.name}`, providerName: row.manifest.name })));
            subtitleCount = tracks.length;
            subtitles.push(...tracks);
          } catch (error) { subtitleError = error instanceof Error ? error.message : 'Subtitle lookup failed'; }
        }
      } else {
        const opts = { media: { id: options.anilistId, idMal: mapping?.ids.malId, englishTitle: options.title, romajiTitle: options.title, synonyms: mapping?.aliases || [], isAdult: false },
          episodeNumber: options.episode || 1, resolution: '1080p', batch: false, bestReleases: true, anidbAID: mapping?.ids.anidbId || 0, anidbEID: mapping?.byNumber.get(options.episode || 1)?.anidbEid || 0,
          query: options.title || mapping?.preferredTitle || '', dub: !!options.dub, episode: options.episode || 1, providerType: row.manifest.type };
        const titleId = row.manifest.type === 'onlinestream-provider' ? await matchRemoteTitle(row, opts, signal) : undefined;
        sources = await invokeRemote(row, 'remoteResolve', { ...opts, titleId });
        if (!Array.isArray(sources)) throw new Error('Invalid source response');
        sources = sources.map(s => ({ ...s, language: languageLabel(s.audioLanguage || s.language || row.manifest.lang), languageLabel: languageLabel(s.audioLanguage || s.language || row.manifest.lang), providerKey: row.id, providerName: row.manifest.name, source: row.manifest.name }));
      }
      signal?.throwIfAborted();
      sources = await proxyRemoteSources(sources);
      report(row, started, subtitleError ? 'partial' : sources.length || subtitleCount ? 'ok' : 'empty', sources.length, subtitleCount + sources.reduce((n, s) => n + (s.subtitles?.length || 0), 0), subtitleError, lookup, attempts); return sources;
    } catch (error) {
      report(row, started, 'error', 0, subtitleCount, error instanceof Error ? error.message : 'Provider failed', lookup, attempts); return [];
    }
  }));
  const merged = settled.flat().map(source => ({ ...source, subtitles: [...new Map([...(source.subtitles || []), ...subtitles].map(t => [t.url, t])).values()] }));
  return { sources: merged, subtitles: [...new Map(subtitles.map(t => [t.url, t])).values()], statuses };
}
