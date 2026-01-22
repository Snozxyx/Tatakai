import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Use multiple APIs for anime images
const WAIFU_API_BASE = 'https://api.waifu.pics';
const WAIFU_IM_API = 'https://api.waifu.im/search';
const NEKOS_API = 'https://nekos.best/api/v2';

export interface NekosImage {
  id: string;
  url: string;
  artist?: { id: number; name: string };
  source?: string;
  rating: string;
  gender?: 'male' | 'female' | 'any';
}

// Fetch random anime images - supports both male and female characters
export async function fetchRandomAnimeImage(options?: {
  rating?: string[];
  tags?: string[];
  limit?: number;
  type?: 'avatar' | 'banner';
  gender?: 'male' | 'female' | 'any';
}): Promise<NekosImage[]> {
  const limit = options?.limit || 6;
  const gender = options?.gender || 'any';
  const images: NekosImage[] = [];
  
  // Female-focused categories from waifu.pics
  const femaleCategories = [
    'waifu', 'neko', 'shinobu', 'megumin', 'awoo', 'smug', 
    'smile', 'happy', 'wink', 'blush'
  ];
  
  // Male character images - using nekos.best which has husbando endpoint
  const maleEndpoints = [
    `${NEKOS_API}/husbando?amount=`,
    `${WAIFU_IM_API}?included_tags=husbando&is_nsfw=false`,
  ];
  
  const bannerCategories = ['waifu', 'neko', 'shinobu', 'megumin', 'awoo'];
  
  if (options?.type === 'banner') {
    // Fetch banner images from waifu.pics
    const fetchPromises = Array.from({ length: limit }, async (_, i) => {
      const randomIndex = Math.floor(Math.random() * bannerCategories.length);
      const category = bannerCategories[randomIndex];
      const res = await fetch(`${WAIFU_API_BASE}/sfw/${category}`);
      if (!res.ok) throw new Error('Failed to fetch image');
      const data = await res.json();
      return {
        id: `waifu-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        url: data.url,
        rating: 'safe',
        gender: 'female' as const,
      } as NekosImage;
    });
    
    const results = await Promise.allSettled(fetchPromises);
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        images.push(result.value);
      }
    });
    return images;
  }
  
  // For avatars, fetch based on gender preference
  const fetchPromises: Promise<NekosImage | null>[] = [];
  
  if (gender === 'male' || gender === 'any') {
    const maleCount = gender === 'male' ? limit : Math.floor(limit / 2);
    
    // Try nekos.best husbando endpoint first (batch request)
    try {
      const res = await fetch(`${NEKOS_API}/husbando?amount=${Math.min(maleCount, 20)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          data.results.slice(0, maleCount).forEach((item: any, i: number) => {
            images.push({
              id: `husbando-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
              url: item.url,
              rating: 'safe',
              gender: 'male' as const,
            });
          });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch from nekos.best:', e);
    }
    
    // Fallback to waifu.im if we didn't get enough
    if (images.length < maleCount) {
      const remaining = maleCount - images.length;
      for (let i = 0; i < remaining; i++) {
        fetchPromises.push(
          fetch(`${WAIFU_IM_API}?included_tags=husbando&is_nsfw=false`)
            .then(res => res.json())
            .then(data => ({
              id: `husbando-im-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
              url: data.images?.[0]?.url || '',
              rating: 'safe',
              gender: 'male' as const,
            }))
            .catch(() => null)
        );
      }
    }
  }
  
  if (gender === 'female' || gender === 'any') {
    // Fetch female characters from waifu.pics
    const femaleCount = gender === 'female' ? limit : Math.ceil(limit / 2);
    const categories = femaleCategories;
    for (let i = 0; i < femaleCount; i++) {
      const randomIndex = Math.floor(Math.random() * categories.length);
      const category = categories[randomIndex];
      fetchPromises.push(
        fetch(`${WAIFU_API_BASE}/sfw/${category}`)
          .then(res => res.json())
          .then(data => ({
            id: `waifu-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            url: data.url,
            rating: 'safe',
            gender: 'female' as const,
          }))
          .catch(() => null)
      );
    }
  }
  
  const results = await Promise.allSettled(fetchPromises);
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value && result.value.url) {
      images.push(result.value);
    }
  });
  
  // Shuffle the results
  return images.sort(() => Math.random() - 0.5);
}

// Hook to fetch random profile images with gender filter
export function useRandomProfileImages(limit = 6, gender: 'male' | 'female' | 'any' = 'any') {
  return useQuery({
    queryKey: ['waifu_profile_images', limit, gender],
    queryFn: () => fetchRandomAnimeImage({ limit, type: 'avatar', gender }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to fetch random banner images
export function useRandomBannerImages(limit = 4) {
  return useQuery({
    queryKey: ['waifu_banner_images', limit],
    queryFn: () => fetchRandomAnimeImage({ limit, type: 'banner' }),
    staleTime: 5 * 60 * 1000,
  });
}

// Update profile avatar with NekosAPI image
export function useUpdateProfileAvatar() {
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (imageUrl: string) => {
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: imageUrl })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Update profile banner with NekosAPI image
export function useUpdateProfileBanner() {
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (imageUrl: string) => {
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('profiles')
        .update({ banner_url: imageUrl })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Fetch public profile by username
export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['public_profile', username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (error) throw error;
      
      // Check if profile is public
      if (!data.is_public) {
        throw new Error('Profile is private');
      }

      return data;
    },
    enabled: !!username,
  });
}

// Fetch public profile's watchlist
export function usePublicWatchlist(userId: string, isPublic: boolean, showWatchlist: boolean = true) {
  return useQuery({
    queryKey: ['public_watchlist', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!userId && isPublic && showWatchlist,
  });
}

// Fetch public profile's watch history
export function usePublicWatchHistory(userId: string, isPublic: boolean, showHistory: boolean = true) {
  return useQuery({
    queryKey: ['public_history', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!userId && isPublic && showHistory,
  });
}

// Update profile privacy
export function useUpdateProfilePrivacy() {
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (isPublic: boolean) => {
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('profiles')
        .update({ is_public: isPublic })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Update showcase anime
export function useUpdateShowcaseAnime() {
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (animeList: Array<{ id: string; title: string; image: string }>) => {
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('profiles')
        .update({ showcase_anime: animeList })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Check if current user follows a profile
export function useIsFollowing(userId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is_following', userId],
    queryFn: async () => {
      if (!user || !userId) return false;

      const { data, error } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    },
    enabled: !!user && !!userId,
  });
}

// Get follower/following counts
export function useFollowCounts(userId?: string) {
  return useQuery({
    queryKey: ['follow_counts', userId],
    queryFn: async () => {
      if (!userId) return { followers: 0, following: 0 };

      const [followersRes, followingRes] = await Promise.all([
        supabase
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', userId),
        supabase
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', userId),
      ]);

      return {
        followers: followersRes.count || 0,
        following: followingRes.count || 0,
      };
    },
    enabled: !!userId,
  });
}

// Follow a user
export function useFollowUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (followingId: string) => {
      if (!user) throw new Error('Must be logged in');
      if (user.id === followingId) throw new Error('Cannot follow yourself');

      const { error } = await supabase
        .from('user_follows')
        .insert({ follower_id: user.id, following_id: followingId });

      if (error) throw error;
    },
    onSuccess: (_, followingId) => {
      queryClient.invalidateQueries({ queryKey: ['is_following', followingId] });
      queryClient.invalidateQueries({ queryKey: ['follow_counts', followingId] });
      queryClient.invalidateQueries({ queryKey: ['follow_counts', user?.id] });
    },
  });
}

// Unfollow a user
export function useUnfollowUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (followingId: string) => {
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', followingId);

      if (error) throw error;
    },
    onSuccess: (_, followingId) => {
      queryClient.invalidateQueries({ queryKey: ['is_following', followingId] });
      queryClient.invalidateQueries({ queryKey: ['follow_counts', followingId] });
      queryClient.invalidateQueries({ queryKey: ['follow_counts', user?.id] });
    },
  });
}
