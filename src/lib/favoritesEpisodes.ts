import { parseExternalAnimeId } from "./animeIdMapping";
import type { LibraryEntry } from "./favoritesLibrary";

export interface AnimeActivity {
  anime_id: string;
  anilist_id?: number | null;
  mal_id?: number | null;
  episode_id?: string | null;
  episode_number?: number;
  watched_at?: string;
  progress_seconds?: number;
  duration_seconds?: number | null;
  completed?: boolean;
}

function identityKeys(
  row: Pick<AnimeActivity, "anime_id" | "anilist_id" | "mal_id">
) {
  const parsed = parseExternalAnimeId(row.anime_id);
  const keys = [`raw:${row.anime_id}`];
  if (parsed) keys.push(`${parsed.provider}:${parsed.id}`);
  else if (/^\d+$/.test(row.anime_id))
    keys.push(`anilist:${Number(row.anime_id)}`);
  if (row.anilist_id) keys.push(`anilist:${row.anilist_id}`);
  if (row.mal_id) keys.push(`mal:${row.mal_id}`);
  return keys;
}

export function latestAnimeActivity<T extends AnimeActivity>(
  rows: T[],
  anime: Pick<AnimeActivity, "anime_id" | "anilist_id" | "mal_id">
): T | undefined {
  const keys = new Set(identityKeys(anime));
  return rows
    .filter(
      (row) => row.episode_id && identityKeys(row).some((key) => keys.has(key))
    )
    .sort(
      (a, b) =>
        (Date.parse(b.watched_at || "") || 0) -
          (Date.parse(a.watched_at || "") || 0) ||
        (b.progress_seconds || 0) - (a.progress_seconds || 0)
    )[0];
}

export const watchEpisodeHref = (episodeId: string) =>
  `/watch/${encodeURIComponent(episodeId)}`;

/** One title header, with real episode links beneath it. Filters run before grouping. */
export function groupHistoryByTitle(entries: LibraryEntry[]) {
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      poster: string | null;
      kind: LibraryEntry["kind"];
      titleHref: string;
      entries: LibraryEntry[];
      updatedAt: string;
    }
  >();
  const aliases = new Map<string, string>();
  // Only explicit catalog IDs can join aliases; equal titles alone cannot merge remakes.
  for (const entry of [...entries].sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
  )) {
    const keys =
      entry.kind === "anime"
        ? identityKeys(entry.source)
        : [`${entry.kind}:${entry.id}`];
    const key =
      keys.map((id) => aliases.get(id)).find(Boolean) ||
      `${entry.kind}:${keys[0]}`;
    for (const alias of keys) aliases.set(alias, key);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: entry.title,
        poster: entry.poster,
        kind: entry.kind,
        titleHref: `/${entry.kind}/${encodeURIComponent(
          entry.kind === "anime"
            ? entry.id
            : entry.source.resolved_manga_id || entry.id
        )}`,
        entries: [],
        updatedAt: entry.updatedAt,
      };
      groups.set(key, group);
    }
    if (!group.entries.some((row) => row.href === entry.href))
      group.entries.push(entry);
    if (Date.parse(entry.updatedAt) > Date.parse(group.updatedAt)) {
      group.updatedAt = entry.updatedAt;
      group.title = entry.title;
      group.poster = entry.poster || group.poster;
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
    )
    .map((group) => ({
      ...group,
      entries: group.entries.sort(
        (a, b) =>
          Number(a.source.episode_number ?? a.source.last_chapter_number ?? 0) -
            Number(
              b.source.episode_number ?? b.source.last_chapter_number ?? 0
            ) || (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
      ),
    }));
}
