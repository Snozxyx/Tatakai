import { useQuery } from '@tanstack/react-query';

export interface AnimeNewsItem {
  id: number;
  title: string;
  synopsis: string | null;
  image: string | null;
  url: string;
  members: number | null;
  score: number | null;
}

/**
 * Anime news / "what's new this season" from the Jikan API (MyAnimeList,
 * keyless + CORS-enabled). Used to give the News tab a real external source
 * alongside News-flaired community posts.
 */
export function useAnimeNews() {
  return useQuery({
    queryKey: ['anime-news-seasonal'],
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<AnimeNewsItem[]> => {
      const res = await fetch('https://api.jikan.moe/v4/seasons/now?limit=16&sfw=true');
      if (!res.ok) throw new Error('Failed to load anime news');
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      return data.map((a: any) => ({
        id: a.mal_id,
        title: a.title_english || a.title,
        synopsis: a.synopsis || null,
        image: a.images?.webp?.image_url || a.images?.jpg?.image_url || null,
        url: a.url,
        members: a.members ?? null,
        score: a.score ?? null,
      }));
    },
  });
}
