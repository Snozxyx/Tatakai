// MangaBaka enrichment for manga recommendations.
// Layers MangaBaka's richer catalogue (weighted tag tree, publishers,
// cross-tracker rating, chapter/volume totals) over the AniList-based
// AnimeMeta. All fetches go through the cached renderer façade
// (`fetchMangaBakaSeries`, 6h TTL, null-on-miss) so enrichment is strictly
// best-effort: a title MangaBaka never heard of still scores on AniList data.

import { fetchMangaBakaSeries, type MangaBakaSeries } from '@/lib/mapping/mangabaka';
import { scoreCandidate } from './scoring';
import type { AnimeMeta, TagWeight, TasteProfile } from './types';

/** MangaBaka centrality -> per-title tag relevance (Step 2 weighting). */
export function mangabakaTagWeight(weight: string | null): number {
  switch (String(weight ?? '').toLowerCase()) {
    case 'core': return 1;
    case 'defining': return 0.7;
    case 'incidental': return 0.4;
    default: return 0.5;
  }
}

/** First segment of `"Activities > Conflict > Duels"` — the tag grouping. */
export function mangabakaTagGroup(path: string | null): string | null {
  if (!path) return null;
  const head = path.split('>').map((s) => s.trim()).filter(Boolean)[0];
  return head ?? null;
}

function mapStatus(status: string | null): string | null {
  switch (String(status ?? '').toLowerCase()) {
    case 'ongoing': case 'publishing': case 'releasing': return 'RELEASING';
    case 'completed': case 'finished': return 'FINISHED';
    case 'hiatus': return 'HIATUS';
    case 'cancelled': return 'CANCELLED';
    case 'upcoming': case 'not_yet_released': return 'NOT_YET_RELEASED';
    default: return null;
  }
}

/** Merge a MangaBaka series into an existing meta in place (mutates + returns it). */
export function mergeMangaBakaMeta(meta: AnimeMeta, series: MangaBakaSeries): AnimeMeta {
  const seenTags = new Set(meta.tagsDetailed?.map((t) => t.name) ?? meta.tags);
  const detailed: TagWeight[] = [...(meta.tagsDetailed ?? meta.tags.map((name) => ({ name, relevance: 1, group: null })))];
  const groups = new Set(meta.tagGroups ?? []);

  for (const tag of series.tags ?? []) {
    if (!tag.name || tag.isSpoiler || seenTags.has(tag.name)) continue;
    seenTags.add(tag.name);
    detailed.push({
      name: tag.name,
      relevance: mangabakaTagWeight(tag.weight),
      group: mangabakaTagGroup(tag.path),
    });
    const g = mangabakaTagGroup(tag.path);
    if (g) groups.add(g);
  }
  for (const genre of series.genres ?? []) {
    if (genre && !meta.genres.includes(genre)) meta.genres.push(genre);
  }

  meta.tags = detailed.map((t) => t.name);
  meta.tagsDetailed = detailed;
  if (groups.size) meta.tagGroups = Array.from(groups);

  // Creators: authors/artists at full weight, publishers by territory.
  const studios = [...meta.studios];
  const weights = [...(meta.studioWeights ?? meta.studios.map(() => 1))];
  const addStudio = (name: string, w: number) => {
    if (!name || studios.includes(name)) return;
    studios.push(name);
    weights.push(w);
  };
  for (const a of series.authors ?? []) addStudio(a, 1);
  for (const a of series.artists ?? []) addStudio(a, 1);
  for (const p of series.publishers ?? []) {
    addStudio(p.name, String(p.type ?? '').toLowerCase() === 'original' ? 1 : 0.5);
  }
  meta.studios = studios;
  meta.studioWeights = weights;

  if (meta.averageScore == null && series.rating != null) meta.averageScore = series.rating;
  if (meta.year == null && series.year != null) meta.year = series.year;
  if ((meta.status == null || meta.status === 'unknown') && series.status) {
    const mapped = mapStatus(series.status);
    if (mapped) meta.status = mapped;
  }
  if (meta.totalChapters == null && series.totalChapters != null) meta.totalChapters = series.totalChapters;
  if (meta.episodes == null && series.totalChapters != null) meta.episodes = series.totalChapters;
  return meta;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/** Enrich every seed that carries an AniList id. Mutates the map in place. */
export async function enrichMangaSeeds(
  seedMeta: Map<string, AnimeMeta>,
  concurrency = 5,
): Promise<void> {
  const entries = Array.from(seedMeta.values()).filter((m) => m.anilistId != null);
  await mapLimit(entries, concurrency, async (meta) => {
    try {
      const series = await fetchMangaBakaSeries(meta.anilistId);
      if (series) mergeMangaBakaMeta(meta, series);
    } catch { /* fail-soft: AniList-only seed */ }
  });
}

/**
 * Enrich the most promising candidates (pre-scored without MangaBaka data).
 * Bounded to `concurrency * 8` titles so mobile stays cheap.
 */
export async function enrichMangaCandidates(
  candidateMap: Map<string, AnimeMeta>,
  profile: TasteProfile,
  concurrency = 5,
): Promise<void> {
  const all = Array.from(candidateMap.values());
  if (!all.length) return;
  const maxPop = all.reduce((m, c) => Math.max(m, c.popularity ?? 0), 0);
  const preScored = all
    .map((c) => ({ c, s: scoreCandidate(c, profile, { maxPopularity: maxPop }).score }))
    .sort((a, b) => b.s - a.s)
    .slice(0, concurrency * 8)
    .map((r) => r.c)
    .filter((m) => m.anilistId != null);
  await mapLimit(preScored, concurrency, async (meta) => {
    try {
      const series = await fetchMangaBakaSeries(meta.anilistId);
      if (series) mergeMangaBakaMeta(meta, series);
    } catch { /* fail-soft */ }
  });
}
