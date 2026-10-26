import { automaticTitleMatch, titleSearchQueries } from './title-match';
import { supportsResource, stremioResourceUrl, type StremioManifest } from './stremio';
import type { RemoteExtension } from './installed';
import { throwCompatibilityAbort } from '../compatibility/abort';

const CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';
export interface StremioTarget { type: string; id: string }
/** Resolve advertised video IDs, including absolute anime episodes across seasons. */
export function episodeVideoId(meta: any, episode: number, mapped?: any): string | null {
  if (meta.type === 'movie') return meta.id || null;
  const videos = (meta.videos || []).filter((v: any) => typeof v.id === 'string' && Number.isInteger(v.episode));
  if (mapped?.seasonNumber != null && mapped?.seasonEpisodeNumber != null) {
    const matches = videos.filter((v: any) => v.season === mapped.seasonNumber && v.episode === mapped.seasonEpisodeNumber);
    return matches.length === 1 ? matches[0].id : null;
  }
  if (videos.every((v: any) => v.season == null)) {
    const matches = videos.filter((v: any) => v.episode === episode);
    return matches.length === 1 ? matches[0].id : null;
  }
  const regular = videos.filter((v: any) => Number.isInteger(v.season) && v.season > 0).sort((a: any, b: any) => a.season - b.season || a.episode - b.episode);
  let season = 0, number = 0;
  for (const video of regular) {
    if (video.season !== season) { if (video.season !== season + 1) return null; season = video.season; number = 0; }
    if (video.episode !== ++number) return null;
  }
  return regular[episode - 1]?.id || null;
}

export async function searchStremioTargets(row: RemoteExtension, options: { anilistId?: number; title?: string; episode?: number }, mapping: any,
  json: (url: string) => Promise<any>, signal?: AbortSignal): Promise<StremioTarget[]> {
  const manifest = row.manifest as StremioManifest;
  const opts = { query: options.title || mapping?.preferredTitle, media: { synonyms: mapping?.aliases || [] } };
  const queries = titleSearchQueries(opts).slice(0, 3);
  if (!queries.length) throw Error('Title unavailable for Stremio search fallback');
  const kinds = mapping?.ids.type ? [mapping.ids.type.toLowerCase() === 'movie' ? 'movie' : 'series'] : ['series', 'movie'];
  const catalogs: Array<{ base: string; type: string; id: string; own: boolean }> = (row.manifest.catalogs || []).filter((c: any) => c.extra?.some((e: any) => e.name === 'search') && !c.extra.some((e: any) => e.isRequired && e.name !== 'search')).slice(0, 4)
    .map((c: any) => ({ base: row.manifestUrl, type: c.type, id: c.id, own: true }));
  catalogs.push(...kinds.map(type => ({ base: CINEMETA, type, id: 'top', own: false })));
  const deadline = Date.now() + 20_000;
  const read = async (url: string) => {
    throwCompatibilityAbort(signal);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Stremio search fallback timed out');
    let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([json(url), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Stremio search fallback timed out')), remaining); })]); }
    finally { clearTimeout(timer!); }
  };
  const batches = await Promise.all(catalogs.map(async catalog => {
    const targets: StremioTarget[] = [];
    for (const query of queries) {
      throwCompatibilityAbort(signal);
      try {
        const url = new URL(stremioResourceUrl(catalog.base, 'catalog', catalog.type, catalog.id));
        url.pathname = url.pathname.replace(/\.json$/, `/search=${encodeURIComponent(query)}.json`);
        const response = await read(url.href);
        const candidates = (response.metas || []).filter((m: any) => automaticTitleMatch([m], opts));
        const unique = [...new Map(candidates.map((m: any) => [m.id, m])).values()] as any[];
        // Don't pick between equally plausible remakes or unrelated formats.
        if (unique.length !== 1) continue;
        const candidate = unique[0];
        const type = candidate.type || catalog.type;
        const canMeta = !catalog.own || supportsResource(manifest, 'meta', type, candidate.id);
        const meta = canMeta ? (await read(stremioResourceUrl(catalog.base, 'meta', type, candidate.id))).meta : candidate;
        if (!meta || !automaticTitleMatch([meta], opts)) continue;
        const id = episodeVideoId({ ...meta, type }, options.episode || 1, mapping?.byNumber?.get(options.episode || 1));
        if (!id || (!supportsResource(manifest, 'stream', type, id) && !supportsResource(manifest, 'subtitles', type, id))) continue;
        targets.push({ type, id }); break;
      } catch (error) { if (signal?.aborted || Date.now() >= deadline) throw error; }
    }
    return targets;
  }));
  const targets = batches.flat();
  const unique = [...new Map(targets.map(t => [`${t.type}:${t.id}`, t])).values()];
  if (!unique.length) throw Error('Stremio search found no supported title with a complete episode mapping');
  if (new Set(unique.map(t => t.type)).size > 1) throw Error('Stremio search matched multiple content types; mapping is ambiguous');
  return unique.slice(0, 4);
}
