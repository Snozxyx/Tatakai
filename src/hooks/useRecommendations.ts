import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist } from './useWatchlist';
import { useWatchHistory } from './useWatchHistory';
import { fetchAnimeInfo, fetchHome, searchAnime, AnimeCard, getProxiedImageUrl } from '@/lib/api';

interface GenrePreference {
  genre: string;
  count: number;
  weight: number;
}

interface RecommendationResult {
  anime: AnimeCard;
  score: number;
  reason: string;
}

// Extract genres from anime data
async function getAnimeGenres(animeId: string): Promise<string[]> {
  try {
    const info = await fetchAnimeInfo(animeId);
    return info?.anime?.moreInfo?.genres || [];
  } catch {
    return [];
  }
}

// Calculate genre preferences from watchlist and history
export function useGenrePreferences() {
  const { user } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: history } = useWatchHistory(50);
  
  return useQuery({
    queryKey: ['genre_preferences', user?.id, watchlist?.length, history?.length],
    queryFn: async (): Promise<GenrePreference[]> => {
      const genreCounts = new Map<string, { count: number; weight: number }>();
      
      // Analyze watchlist anime (higher weight for completed, watching)
      if (watchlist) {
        for (const item of watchlist.slice(0, 20)) { // Limit to prevent too many API calls
          const genres = await getAnimeGenres(item.anime_id);
          const weight = item.status === 'completed' ? 3 : 
                        item.status === 'watching' ? 2.5 : 
                        item.status === 'plan_to_watch' ? 1.5 : 1;
          
          for (const genre of genres) {
            const existing = genreCounts.get(genre) || { count: 0, weight: 0 };
            genreCounts.set(genre, {
              count: existing.count + 1,
              weight: existing.weight + weight,
            });
          }
        }
      }
      
      // Analyze watch history (weight by completion and recency)
      if (history) {
        for (const item of history.slice(0, 30)) {
          const genres = await getAnimeGenres(item.anime_id);
          const completionWeight = item.completed ? 2 : 
                                   (item.duration_seconds && item.progress_seconds / item.duration_seconds > 0.5) ? 1.5 : 1;
          
          for (const genre of genres) {
            const existing = genreCounts.get(genre) || { count: 0, weight: 0 };
            genreCounts.set(genre, {
              count: existing.count + 1,
              weight: existing.weight + completionWeight,
            });
          }
        }
      }
      
      // Sort by weight
      const preferences = Array.from(genreCounts.entries())
        .map(([genre, data]) => ({ genre, ...data }))
        .sort((a, b) => b.weight - a.weight);
      
      return preferences;
    },
    enabled: !!user && (!!watchlist?.length || !!history?.length),
    staleTime: 300000, // 5 minutes cache
  });
}

// Get personalized recommendations based on user preferences
export function usePersonalizedRecommendations(limit: number = 20) {
  const { user } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: history } = useWatchHistory();
  const { data: preferences } = useGenrePreferences();
  
  return useQuery({
    queryKey: ['recommendations', user?.id, preferences?.length],
    queryFn: async (): Promise<RecommendationResult[]> => {
      if (!preferences || preferences.length === 0) {
        // Fallback: return homepage trending
        const homepage = await fetchHome();
        return (homepage?.spotlightAnimes || []).slice(0, limit).map(anime => ({
          anime: {
            id: anime.id,
            name: anime.name,
            poster: anime.poster,
            type: 'TV',
            episodes: { sub: 0, dub: 0 },
            rating: undefined,
          },
          score: 50,
          reason: 'Popular anime',
        }));
      }
      
      // Get top 3 genres for search
      const topGenres = preferences.slice(0, 3).map(p => p.genre);
      const watchedIds = new Set([
        ...(watchlist?.map(w => w.anime_id) || []),
        ...(history?.map(h => h.anime_id) || []),
      ]);
      
      const recommendations: RecommendationResult[] = [];
      
      // Search for anime in top genres
      for (const genre of topGenres) {
        try {
          const results = await searchAnime(genre);
          if (results?.animes) {
            for (const anime of results.animes) {
              // Skip already watched
              if (watchedIds.has(anime.id)) continue;
              
              // Skip duplicates
              if (recommendations.some(r => r.anime.id === anime.id)) continue;
              
              // Get anime genres to calculate match score
              const animeGenres = await getAnimeGenres(anime.id);
              let score = 0;
              const matchedGenres: string[] = [];
              
              for (const g of animeGenres) {
                const pref = preferences.find(p => p.genre.toLowerCase() === g.toLowerCase());
                if (pref) {
                  score += pref.weight * 10;
                  matchedGenres.push(g);
                }
              }
              
              // Bonus for rating
              if (anime.rating) {
                score += parseFloat(anime.rating) * 5;
              }
              
              recommendations.push({
                anime: {
                  id: anime.id,
                  name: anime.name,
                  poster: anime.poster,
                  type: anime.type || 'TV',
                  episodes: anime.episodes,
                  rating: anime.rating,
                },
                score,
                reason: matchedGenres.length > 0 
                  ? `Because you like ${matchedGenres.slice(0, 2).join(' & ')}`
                  : `Similar to your taste`,
              });
              
              if (recommendations.length >= limit * 2) break;
            }
          }
        } catch (error) {
          console.log('Search error for genre:', genre);
        }
        
        if (recommendations.length >= limit * 2) break;
      }
      
      // Sort by score and return top results
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    enabled: !!user && (!!watchlist?.length || !!history?.length),
    staleTime: 600000, // 10 minutes cache
  });
}

// Get quick recommendations for homepage "For You" section
export function useQuickRecommendations(limit: number = 10) {
  const { user } = useAuth();
  const { data: watchlist } = useWatchlist();
  
  return useQuery({
    queryKey: ['quick_recommendations', user?.id, watchlist?.length],
    queryFn: async (): Promise<AnimeCard[]> => {
      const homepage = await fetchHome();
      
      if (!watchlist || watchlist.length === 0) {
        // Return trending for new users
        return (homepage?.spotlightAnimes || []).slice(0, limit).map(anime => ({
          id: anime.id,
          name: anime.name,
          poster: anime.poster,
          type: 'TV',
          episodes: { sub: 0, dub: 0 },
          rating: undefined,
        }));
      }
      
      // Get genres from one watchlist item for quick recommendations
      const sampleAnime = watchlist[0];
      const genres = await getAnimeGenres(sampleAnime.anime_id);
      const topGenre = genres[0];
      
      if (topGenre) {
        try {
          const results = await searchAnime(topGenre);
          const watchedIds = new Set(watchlist.map(w => w.anime_id));
          
          return (results?.animes || [])
            .filter(a => !watchedIds.has(a.id))
            .slice(0, limit)
            .map(anime => ({
              id: anime.id,
              name: anime.name,
              poster: anime.poster,
              type: anime.type || 'TV',
              episodes: anime.episodes,
              rating: anime.rating,
            }));
        } catch {
          // Fallback
        }
      }
      
      // Fallback to homepage data
      return (homepage?.latestEpisodeAnimes || []).slice(0, limit).map(anime => ({
        id: anime.id,
        name: anime.name,
        poster: anime.poster,
        type: anime.type || 'TV',
        episodes: anime.episodes || { sub: 0, dub: 0 },
        rating: anime.rating,
      }));
    },
    enabled: true, // Always enabled, works for guests too
    staleTime: 300000, // 5 minutes
  });
}
