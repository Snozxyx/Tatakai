interface EpisodeAvailability {
  number: number;
  hasAired?: boolean;
  airDateUtc?: string | null;
  airDate?: string | null;
  isSpecial?: boolean;
}

export function episodeAirTime(episode: Pick<EpisodeAvailability, 'airDateUtc' | 'airDate'>): number | null {
  for (const value of [episode.airDateUtc, episode.airDate]) {
    const time = value ? Date.parse(value) : NaN;
    if (Number.isFinite(time)) return time;
  }
  return null;
}

/** Missing dates do not make episodes after a known upcoming episode playable. */
export function applyEpisodeAvailability<T extends EpisodeAvailability>(
  episodes: T[],
  nextAiring?: { episode: number; airingAt: number } | null,
  now = Date.now(),
): T[] {
  let firstUpcoming = nextAiring && nextAiring.airingAt * 1000 > now
    && nextAiring.episode > 0 ? nextAiring.episode : Infinity;
  for (const episode of episodes) {
    if (episode.isSpecial) continue;
    const airTime = episodeAirTime(episode);
    if (airTime !== null ? airTime > now : episode.hasAired === false) {
      firstUpcoming = Math.min(firstUpcoming, episode.number);
    }
  }
  return episodes.map(episode => {
    const airTime = episodeAirTime(episode);
    const hasAired = airTime !== null ? airTime <= now
      : !episode.isSpecial && episode.number >= firstUpcoming ? false : episode.hasAired;
    return hasAired === episode.hasAired ? episode : { ...episode, hasAired };
  });
}

export function availableDownloadEpisodes<T extends EpisodeAvailability>(episodes: T[], now = Date.now()): T[] {
  return applyEpisodeAvailability(episodes, undefined, now).filter(episode => episode.hasAired !== false);
}
