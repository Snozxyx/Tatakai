import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/lib/api';

export interface ExternalIds {
  malId: number | null;
  anilistId: number | null;
  source: 'hianime' | 'database' | 'episode' | 'manual' | 'none';
}

/**
 * Multi-source external ID resolver
 * Priority: 1. HiAnime API -> 2. Database (watchlist/history) -> 3. Episode sources -> 4. None (needs manual)
 */
async function fetchExternalIds(
  animeId: string,
  userId?: string
): Promise<ExternalIds> {
  console.log('[ExternalIds] Starting ID resolution for:', animeId);

  // 1. Try HiAnime API first
  try {
    console.log('[ExternalIds] Trying HiAnime API...');
    const data = await apiGet<any>(`/anime/${animeId}`);
    
    const malId = data?.anime?.info?.malId;
    const anilistId = data?.anime?.info?.anilistId;
    
    if (malId || anilistId) {
      console.log('[ExternalIds] ✓ Found from HiAnime:', { malId, anilistId });
      return { malId: malId || null, anilistId: anilistId || null, source: 'hianime' };
    }
    console.log('[ExternalIds] ✗ HiAnime returned no IDs');
  } catch (error) {
    console.warn('[ExternalIds] ✗ HiAnime API failed:', error);
  }

  // 2. Try database lookup (watchlist and watch_history)
  if (userId) {
    try {
      console.log('[ExternalIds] Trying database lookup...');
      
      // Check watchlist first
      const { data: watchlistItem } = await supabase
        .from('watchlist')
        .select('mal_id, anilist_id')
        .eq('user_id', userId)
        .eq('anime_id', animeId)
        .maybeSingle();

      if (watchlistItem?.mal_id || watchlistItem?.anilist_id) {
        console.log('[ExternalIds] ✓ Found from watchlist:', watchlistItem);
        return {
          malId: watchlistItem.mal_id || null,
          anilistId: watchlistItem.anilist_id || null,
          source: 'database'
        };
      }

      // Check watch_history
      const { data: historyItem } = await supabase
        .from('watch_history')
        .select('mal_id, anilist_id')
        .eq('user_id', userId)
        .eq('anime_id', animeId)
        .order('watched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (historyItem?.mal_id || historyItem?.anilist_id) {
        console.log('[ExternalIds] ✓ Found from watch_history:', historyItem);
        return {
          malId: historyItem.mal_id || null,
          anilistId: historyItem.anilist_id || null,
          source: 'database'
        };
      }

      // Check if any other user has this anime with IDs (community data)
      const { data: communityItem } = await supabase
        .from('watchlist')
        .select('mal_id, anilist_id')
        .eq('anime_id', animeId)
        .not('mal_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (communityItem?.mal_id || communityItem?.anilist_id) {
        console.log('[ExternalIds] ✓ Found from community data:', communityItem);
        return {
          malId: communityItem.mal_id || null,
          anilistId: communityItem.anilist_id || null,
          source: 'database'
        };
      }

      console.log('[ExternalIds] ✗ Database has no IDs');
    } catch (error) {
      console.warn('[ExternalIds] ✗ Database lookup failed:', error);
    }
  }

  // 3. Try to resolve from episode sources (as a last resort)
  try {
    console.log('[ExternalIds] Trying episode sources fallback...');
    const { fetchEpisodes, fetchTatakaiEpisodeSources } = await import('@/lib/api');
    
    const episodesData = await fetchEpisodes(animeId);
    if (episodesData?.episodes?.[0]) {
      const sourceData = await fetchTatakaiEpisodeSources(episodesData.episodes[0].episodeId);
      
      if (sourceData?.malID) {
        const malId = Number(sourceData.malID);
        console.log('[ExternalIds] ✓ Found MAL ID from episode sources:', malId);
        return { malId, anilistId: null, source: 'episode' };
      }
    }
    console.log('[ExternalIds] ✗ Episode sources have no IDs');
  } catch (error) {
    console.warn('[ExternalIds] ✗ Episode sources fallback failed:', error);
  }

  console.log('[ExternalIds] ✗ All sources failed - manual entry needed');
  return { malId: null, anilistId: null, source: 'none' };
}

/**
 * Hook to get external IDs (MAL/AniList) with multiple fallback sources
 */
export function useExternalIds(animeId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['external-ids', animeId, user?.id],
    queryFn: () => fetchExternalIds(animeId!, user?.id),
    enabled: !!animeId,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours cache
    retry: 1, // Only retry once since we have multiple fallbacks
  });
}

/**
 * Save manually entered IDs to the database for future use
 */
export async function saveManualIds(
  animeId: string,
  userId: string,
  malId: number | null,
  anilistId: number | null
): Promise<boolean> {
  try {
    console.log('[ExternalIds] Saving manual IDs:', { animeId, malId, anilistId });
    
    // Update watchlist if exists
    const { error: watchlistError } = await supabase
      .from('watchlist')
      .update({
        mal_id: malId,
        anilist_id: anilistId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('anime_id', animeId);

    if (watchlistError) {
      console.warn('[ExternalIds] Watchlist update failed:', watchlistError);
    }

    // Update watch_history if exists
    const { error: historyError } = await supabase
      .from('watch_history')
      .update({
        mal_id: malId,
        anilist_id: anilistId
      })
      .eq('user_id', userId)
      .eq('anime_id', animeId);

    if (historyError) {
      console.warn('[ExternalIds] Watch history update failed:', historyError);
    }

    console.log('[ExternalIds] ✓ Manual IDs saved successfully');
    return true;
  } catch (error) {
    console.error('[ExternalIds] ✗ Failed to save manual IDs:', error);
    return false;
  }
}
