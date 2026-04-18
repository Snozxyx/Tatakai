import { useQuery } from '@tanstack/react-query';
import { API_URL, TATAKAI_API_URL, unwrapApiData } from '@/lib/api/api-client';

interface Season {
  id: string;
  name: string;
  title: string;
  poster: string;
  isCurrent: boolean;
}

export function useAnimeSeasons(animeId: string | undefined) {
  return useQuery({
    queryKey: ['anime-seasons', animeId],
    queryFn: async (): Promise<Season[]> => {
      if (!animeId) return [];

      try {
        let resolvedAnimeId = animeId;

        // New model: numeric AniList IDs are mapped via /api/v2/anime/mapper.
        if (/^\d+$/.test(animeId)) {
          const mapperRes = await fetch(`${TATAKAI_API_URL}/mapper/map/hianime/${animeId}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(6000),
          });

          if (mapperRes.ok) {
            const mapperJson = await mapperRes.json();
            const mapped = unwrapApiData<{ id?: string | number }>(mapperJson as any);
            const mappedId = String(mapped?.id || '').trim();
            if (mappedId) {
              resolvedAnimeId = mappedId;
            }
          }
        }

        // Try the local proxy endpoint first (avoids CORS issues in browser)
        const proxyUrl = `/api/proxy/aniwatch/anime/${resolvedAnimeId}`;
        const directUrl = `${API_URL}/anime/${resolvedAnimeId}`;

        let res: Response | null = null;
        let attemptedUrl = proxyUrl;

        try {
          res = await fetch(proxyUrl, { credentials: 'same-origin' });
        } catch (e) {
          // If proxy fails, try direct fetch
          attemptedUrl = directUrl;
          res = await fetch(directUrl);
        }

        if (!res || !res.ok) {
          const text = await (res ? res.text() : Promise.resolve('No response'));
          const err = new Error(`Failed to fetch seasons: ${res ? `${res.status} ${res.statusText}` : 'no response'} - ${text}`);
          const { logger } = await import('@/lib/logger');
          void logger.error(err, { url: attemptedUrl, animeId, status: res ? res.status : null, text });
          return [];
        }

        const raw = await res.json();
        const data = unwrapApiData<any>(raw as any);
        const relatedAnimes = Array.isArray(data?.relatedAnimes) ? data.relatedAnimes : [];
        const currentAnimeInfo = data?.anime?.info || {};
        const seasonRelations = ['Sequel', 'Prequel', 'Parent story', 'Side story', 'Alternative version'];

        const seasons = relatedAnimes
          .filter((anime: any) =>
            seasonRelations.some(rel =>
              anime.type?.toLowerCase().includes(rel.toLowerCase()) ||
              anime.name?.toLowerCase().includes('season') ||
              anime.name?.toLowerCase().includes('part')
            ) ||
            isSameSeries(currentAnimeInfo?.name, anime.name)
          )
          .map((anime: any) => ({
            id: anime.id,
            name: anime.name,
            title: anime.name,
            poster: anime.poster,
            isCurrent: anime.id === resolvedAnimeId,
          }));

        // Add current anime to seasons list
        const currentSeasonEntry = {
          id: resolvedAnimeId,
          name: currentAnimeInfo?.name || '',
          title: currentAnimeInfo?.name || '',
          poster: currentAnimeInfo?.poster || '',
          isCurrent: true,
        };

        if (!seasons.some((s: Season) => s.id === resolvedAnimeId)) {
          seasons.push(currentSeasonEntry);
        }

        // Sort by name
        seasons.sort((a: Season, b: Season) => {
          const aNum = extractSeasonNumber(a.name);
          const bNum = extractSeasonNumber(b.name);
          if (aNum !== null && bNum !== null) return aNum - bNum;
          return a.name.localeCompare(b.name);
        });

        return seasons;
      } catch (error) {
        const { logger } = await import('@/lib/logger');
        void logger.error(new Error('Failed to fetch seasons'), { error, animeId });
        return [];
      }
    },
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Helper to check if two anime names are from the same series
function isSameSeries(name1: string | undefined, name2: string | undefined): boolean {
  if (!name1 || !name2) return false;

  const normalize = (str: string) => str
    .toLowerCase()
    .replace(/season \d+/gi, '')
    .replace(/part \d+/gi, '')
    .replace(/\d+(st|nd|rd|th) season/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  const n1 = normalize(name1);
  const n2 = normalize(name2);
  return n1.includes(n2) || n2.includes(n1) || n1 === n2;
}

// Helper to extract season number from name
function extractSeasonNumber(name: string): number | null {
  const patterns = [
    /season (\d+)/i,
    /(\d+)(st|nd|rd|th) season/i,
    /part (\d+)/i,
    /\s+(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}
