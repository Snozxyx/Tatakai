/**
 * `MangaCard` → `PosterItem`, so the manga surfaces render the same card as the
 * anime ones (docs/Plans.md §2 — "Cards (improve polish and consistency)").
 *
 * The manga sections used to carry their own card: a 140px fixed-width tile in a
 * horizontal scroller, with its own rank pip, its own `text-amber-400` score and
 * a title that clipped against the scroller's bottom edge. Mapping to
 * `PosterItem` instead means the trending board and the favorites picks get the
 * shared `PosterCard` — one set of badges, one rank ramp, one hover treatment.
 *
 * `anilistId` is deliberately left unset. It is what the hover preview resolves
 * against, and AniList numbers manga in a different namespace from anime, so
 * passing one through would fetch an unrelated show's video.
 */
import type { PosterItem } from '@/components/anime/discover/types';
import type { MangaCard } from '@/core/content/manga-client';
import type { MangaSearchItem } from '@/types/manga';

/** AniList's `status` enum, lowercased by the client, in the app's wording. */
const STATUS_LABEL: Record<string, string> = {
  releasing: 'Ongoing',
  finished: 'Completed',
  not_yet_released: 'Upcoming',
  cancelled: 'Cancelled',
  hiatus: 'Hiatus',
};

function statusLabel(status: string): string | undefined {
  const key = status?.toLowerCase().replace(/\s+/g, '_');
  if (!key) return undefined;
  return STATUS_LABEL[key] ?? status;
}

/** `manhwa`/`manhua` are worth naming; plain `manga` is what the section says. */
function formatLabel(format?: string): string | undefined {
  if (!format) return undefined;
  const lower = format.toLowerCase();
  if (lower === 'manga') return undefined;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function mangaCardToPosterItem(manga: MangaCard, index = 0): PosterItem {
  const href = manga.anilistId
    ? `/manga/anilist:${manga.anilistId}`
    : manga.malId
      ? `/manga/mal:${manga.malId}`
      : `/manga/${manga.id}`;

  /** AniList scores manga 0–100; every card in the app shows a 0–10 figure. */
  const score = manga.score && manga.score > 0 ? (manga.score / 10).toFixed(1) : undefined;

  const meta = [
    formatLabel(manga.format),
    manga.chapters ? `${manga.chapters} ch` : undefined,
    statusLabel(manga.status),
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return {
    key: `${manga.id || manga.title}-${index}`,
    href,
    title: manga.title,
    poster: manga.poster ?? '',
    meta: meta || undefined,
    score,
  };
}

/**
 * The same projection for the search/browse pipeline, whose rows are
 * `MangaSearchItem` rather than `MangaCard` — the discover catalogue talks to
 * `searchManga`, not to the section endpoints.
 *
 * Returns `null` for a row with no title or no id at all, which the providers do
 * occasionally emit; the caller drops those rather than rendering a card that
 * links nowhere.
 */
export function mangaSearchItemToPosterItem(
  item: MangaSearchItem,
  index = 0,
): PosterItem | null {
  const title =
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || '';
  const id = String(item.id || item.anilistId || item.malId || '').trim();
  if (!title || !id) return null;

  const href = item.anilistId
    ? `/manga/anilist:${item.anilistId}`
    : item.malId
      ? `/manga/mal:${item.malId}`
      : `/manga/${id}`;

  const score = item.score && item.score > 0 ? (item.score / 10).toFixed(1) : undefined;

  const meta = [
    formatLabel(item.mediaType),
    item.year ? String(item.year) : undefined,
    item.chapters ? `${item.chapters} ch` : undefined,
    statusLabel(item.status),
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return {
    key: `${id}-${index}`,
    href,
    title,
    poster: item.poster ?? '',
    meta: meta || undefined,
    score,
  };
}
