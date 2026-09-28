/**
 * useAnimeSeasons.ts
 *
 * Builds the complete, accurate watch-order chain for an anime using AniList's
 * PREQUEL and SEQUEL relations graph, recursively traversing connected entries.
 *
 * Features:
 *   - Direct AniList GraphQL traversal (fetches multi-season sequels & prequels)
 *   - Filters out non-anime (MANGA, NOVEL) and tangential spin-offs
 *   - Chronological sorting by AniList startDate (year, month, day)
 *   - Intelligent season classification (e.g. "SEASON 1", "SEASON 2", "SEASON 2 PART 2", "FINAL SEASON", "MOVIE")
 *   - Ratings, air year, episode count, and 16:9 banner/poster assets
 *   - Fallback to contentGraph if AniList direct query is unavailable
 */

import { useQuery } from '@tanstack/react-query';
import { contentGraph } from '@/core';
import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';
import type { MediaFormat } from '@/core/content/types';

export interface WatchOrderEntry {
  id: string;
  name: string;
  poster: string;
  banner?: string;
  isCurrent: boolean;
  /** 1-based chronological index */
  seasonNumber: number;
  /** Classified label: e.g. "SEASON 1", "SEASON 2", "SEASON 2 PART 2", "MOVIE", "OVA" */
  classification: string;
  /** Episode count: e.g. 25 -> "25 EPS" */
  episodeCount?: number;
  /** Air year: e.g. 2016 */
  year?: number;
  /** Display format label: e.g. "TV", "Movie", "OVA" */
  format?: string;
  /** Star rating: e.g. "8.1" */
  rating?: string;
  /** Relation type from AniList */
  relationType?: string;
}

// Routed through the TatakaiAPI proxy (mirror-first) — see src/lib/anilist.ts.
const ANILIST_GRAPHQL_URL = ANILIST_GRAPHQL_ENDPOINT;

const ANIME_FORMATS = new Set<string>([
  'TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL',
]);

const WATCH_ORDER_RELATION_TYPES = new Set(['PREQUEL', 'SEQUEL']);

interface AniListMediaNode {
  id: number;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  averageScore?: number | null;
  bannerImage?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  } | null;
  startDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  relations?: {
    edges?: Array<{
      relationType: string;
      node: AniListMediaNode;
    }> | null;
  } | null;
}

async function queryAniListMedia(id: number): Promise<AniListMediaNode | null> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title {
          romaji
          english
          native
        }
        format
        status
        episodes
        averageScore
        bannerImage
        coverImage {
          extraLarge
          large
          medium
        }
        startDate {
          year
          month
          day
        }
        relations {
          edges {
            relationType
            node {
              id
              title {
                romaji
                english
                native
              }
              format
              status
              episodes
              averageScore
              bannerImage
              coverImage {
                extraLarge
                large
                medium
              }
              startDate {
                year
                month
                day
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { id } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.Media ?? null;
  } catch {
    return null;
  }
}

async function queryAniListBatch(ids: number[]): Promise<AniListMediaNode[]> {
  if (ids.length === 0) return [];
  const gql = `
    query ($ids: [Int]) {
      Page(perPage: 25) {
        media(id_in: $ids, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          format
          status
          episodes
          averageScore
          bannerImage
          coverImage {
            extraLarge
            large
            medium
          }
          startDate {
            year
            month
            day
          }
          relations {
            edges {
              relationType
              node {
                id
                format
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { ids } }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

/**
 * Traverses the connected PREQUEL/SEQUEL chain starting from rootId.
 */
async function fetchCompleteAniListChain(rootId: number): Promise<AniListMediaNode[]> {
  const rootMedia = await queryAniListMedia(rootId);
  if (!rootMedia) return [];

  const visited = new Map<number, AniListMediaNode>();
  visited.set(rootMedia.id, rootMedia);

  // Discover connected prequel and sequel IDs
  const pendingIds = new Set<number>();
  const checkRelations = (media: AniListMediaNode) => {
    for (const edge of media.relations?.edges ?? []) {
      const relType = edge.relationType?.toUpperCase();
      if (!WATCH_ORDER_RELATION_TYPES.has(relType)) continue;
      const node = edge.node;
      if (!node?.id) continue;
      const fmt = (node.format ?? '').toUpperCase();
      if (fmt && !ANIME_FORMATS.has(fmt)) continue;
      if (!visited.has(node.id)) {
        pendingIds.add(node.id);
      }
    }
  };

  checkRelations(rootMedia);

  // Fetch missing entries in batches (up to 2 rounds to cover full multi-season chains)
  let depth = 0;
  while (pendingIds.size > 0 && depth < 2) {
    depth++;
    const batch = Array.from(pendingIds).slice(0, 20);
    for (const id of batch) pendingIds.delete(id);

    const fetched = await queryAniListBatch(batch);
    for (const item of fetched) {
      if (!visited.has(item.id)) {
        visited.set(item.id, item);
        checkRelations(item);
      }
    }
  }

  return Array.from(visited.values());
}

export function useAnimeSeasons(animeId: string | undefined) {
  return useQuery({
    queryKey: ['anime-watch-order-v2', animeId],
    queryFn: async (): Promise<WatchOrderEntry[]> => {
      if (!animeId) return [];

      try {
        let numericAnilistId: number | undefined;
        if (/^\d+$/.test(animeId)) {
          numericAnilistId = Number(animeId);
        } else {
          const match = animeId.match(/^anilist[:_-]?(\d+)$/i);
          if (match?.[1]) {
            numericAnilistId = Number(match[1]);
          }
        }

        // If numeric ID not obvious from param, resolve via contentGraph
        let fallbackMedia: any = null;
        if (!numericAnilistId) {
          try {
            fallbackMedia = await contentGraph.getMedia(animeId);
            if (fallbackMedia?.anilistId) {
              numericAnilistId = Number(fallbackMedia.anilistId);
            }
          } catch {
            // non-fatal
          }
        }

        // ── 1. Query AniList chain if we have an anilist ID ────────────────────
        let nodes: AniListMediaNode[] = [];
        if (numericAnilistId) {
          try {
            nodes = await fetchCompleteAniListChain(numericAnilistId);
          } catch {
            nodes = [];
          }
        }

        // ── 2. Fallback to contentGraph if AniList query failed/empty ───────────
        if (nodes.length === 0) {
          if (!fallbackMedia) {
            fallbackMedia = await contentGraph.getMedia(animeId);
          }
          if (!fallbackMedia) return [];

          const currentId = String(fallbackMedia.anilistId || animeId);
          const entries: WatchOrderEntry[] = [];

          // Current media
          entries.push({
            id: currentId,
            name: fallbackMedia.titleEnglish || fallbackMedia.titleRomaji || 'Unknown',
            poster: fallbackMedia.coverImageLarge || fallbackMedia.coverImageMedium || '',
            banner: fallbackMedia.bannerImage,
            isCurrent: true,
            seasonNumber: 1,
            classification: 'SEASON 1',
            episodeCount: fallbackMedia.episodes,
            year: fallbackMedia.startDate?.year || fallbackMedia.seasonYear,
            format: formatLabel(fallbackMedia.format),
            rating: fallbackMedia.averageScore ? (fallbackMedia.averageScore / 10).toFixed(1) : undefined,
          });

          // Relations
          for (const rel of fallbackMedia.relations || []) {
            const relType = rel.relationType?.toUpperCase();
            if (!WATCH_ORDER_RELATION_TYPES.has(relType)) continue;
            if (rel.format && !ANIME_FORMATS.has(rel.format.toUpperCase())) continue;

            entries.push({
              id: String(rel.id),
              name: rel.titleEnglish || rel.titleRomaji || 'Unknown',
              poster: rel.coverImage || '',
              isCurrent: false,
              seasonNumber: 0,
              classification: '',
              episodeCount: rel.episodes,
              year: rel.startDate?.year || rel.seasonYear,
              format: formatLabel(rel.format),
              relationType: relType,
            });
          }

          _sortAndClassify(entries);
          return entries;
        }

        // ── 3. Convert AniList nodes into WatchOrderEntry items ─────────────────
        const currentTargetId = String(numericAnilistId ?? animeId);
        const entries: WatchOrderEntry[] = nodes.map((node) => {
          const title = node.title?.english || node.title?.romaji || node.title?.native || 'Unknown';
          const poster = node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '';
          const rating = node.averageScore ? (node.averageScore / 10).toFixed(1) : undefined;
          const year = node.startDate?.year || undefined;
          const format = formatLabel(node.format);

          return {
            id: String(node.id),
            name: title,
            poster,
            banner: node.bannerImage || undefined,
            isCurrent: String(node.id) === currentTargetId,
            seasonNumber: 0,
            classification: '',
            episodeCount: node.episodes || undefined,
            year,
            format,
            rating,
          };
        });

        // Add node startDate map for precision sorting
        const dateMap = new Map<string, { year: number; month: number; day: number }>();
        for (const node of nodes) {
          dateMap.set(String(node.id), {
            year: node.startDate?.year ?? 9999,
            month: node.startDate?.month ?? 0,
            day: node.startDate?.day ?? 0,
          });
        }

        _sortAndClassify(entries, dateMap);
        return entries;
      } catch (error) {
        console.error('[useAnimeSeasons] Error building watch order:', error);
        return [];
      }
    },
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: 1000 * 60 * 60 * 2, // 2 hours
  });
}

// ─── Classification & Sorting Helpers ────────────────────────────────────────

function _sortAndClassify(
  entries: WatchOrderEntry[],
  dateMap?: Map<string, { year: number; month: number; day: number }>
) {
  // Sort chronologically by startDate
  entries.sort((a, b) => {
    const aDate = dateMap?.get(a.id);
    const bDate = dateMap?.get(b.id);

    const aYear = aDate?.year ?? a.year ?? 9999;
    const bYear = bDate?.year ?? b.year ?? 9999;
    if (aYear !== bYear) return aYear - bYear;

    const aMonth = aDate?.month ?? 0;
    const bMonth = bDate?.month ?? 0;
    if (aMonth !== bMonth) return aMonth - bMonth;

    const aDay = aDate?.day ?? 0;
    const bDay = bDate?.day ?? 0;
    if (aDay !== bDay) return aDay - bDay;

    const aNum = extractSeasonNumber(a.name);
    const bNum = extractSeasonNumber(b.name);
    if (aNum !== null && bNum !== null) return aNum - bNum;

    return a.name.localeCompare(b.name);
  });

  // Assign season numbers and classify each entry
  let tvCount = 0;
  entries.forEach((entry, idx) => {
    const isTV = !entry.format || entry.format === 'TV' || entry.format === 'TV Short';
    if (isTV) tvCount++;
    entry.seasonNumber = idx + 1;
    entry.classification = classifySeasonBadge(entry.name, entry.format, tvCount);
  });
}

function classifySeasonBadge(name: string, format?: string, tvIndex = 1): string {
  const clean = name.trim();

  // "Final Season Part X" / "The Final Season Part X"
  const finalPartMatch = clean.match(/final\s+season[,\s]*(?:part|cour)\s*(\d+)/i);
  if (finalPartMatch) {
    return `FINAL SEASON PART ${finalPartMatch[1]}`;
  }

  // "The Final Season"
  if (/final\s+season/i.test(clean)) {
    return 'FINAL SEASON';
  }

  // "Season X Part Y" / "Season X Cour Y"
  const seasonPartMatch = clean.match(/season\s*(\d+)[,\s]*(?:part|cour)\s*(\d+)/i);
  if (seasonPartMatch) {
    return `SEASON ${seasonPartMatch[1]} PART ${seasonPartMatch[2]}`;
  }

  // "Season X" / "Xth Season"
  const seasonMatch = clean.match(/season\s*(\d+)/i) || clean.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
  if (seasonMatch) {
    return `SEASON ${seasonMatch[1]}`;
  }

  // Standalone "Part X"
  const partMatch = clean.match(/part\s*(\d+)/i);
  if (partMatch) {
    return `PART ${partMatch[1]}`;
  }

  // Movie
  if (format === 'Movie' || /the\s+movie/i.test(clean)) {
    return 'MOVIE';
  }

  // OVA / ONA / Special
  if (format === 'OVA' || format === 'ONA' || format === 'Special') {
    return format.toUpperCase();
  }

  // Fallback to chronological season index (e.g. 1st TV series is "SEASON 1")
  return `SEASON ${tvIndex}`;
}

function extractSeasonNumber(name: string): number | null {
  const patterns = [
    /season\s+(\d+)/i,
    /(\d+)(st|nd|rd|th)\s+season/i,
    /part\s+(\d+)/i,
    /\bS(\d+)\b/i,
    /\s+(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function formatLabel(format?: string | null): string | undefined {
  if (!format) return undefined;
  const upper = format.toUpperCase();
  const map: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Special',
  };
  return map[upper] ?? format;
}


