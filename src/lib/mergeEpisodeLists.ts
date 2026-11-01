import type { EpisodeData } from '@/types/anime';

/** Keep tracker identities and metadata while adding episodes found by the API. */
export function mergeEpisodeLists(...lists: EpisodeData[][]): EpisodeData[] {
  const episodes = new Map<number, EpisodeData>();
  for (const list of lists) for (const episode of list) {
    if (!Number.isInteger(episode.number) || episode.number <= 0 || episode.isSpecial) continue;
    const existing = episodes.get(episode.number);
    if (!existing) {
      episodes.set(episode.number, { ...episode });
      continue;
    }
    const merged = { ...episode, ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value != null && value !== '')) } as EpisodeData;
    if ((!existing.title || /^episode\s*\d+$/i.test(existing.title.trim())) && episode.title) merged.title = episode.title;
    merged.isFiller = existing.isFiller || episode.isFiller;
    episodes.set(episode.number, merged);
  }
  return [...episodes.values()].sort((a, b) => a.number - b.number);
}
