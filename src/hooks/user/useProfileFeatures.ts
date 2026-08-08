import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ── API Providers (all verified working) ────────────────────────────────────
const WAIFU_IM_API  = 'https://api.waifu.im/search';
const NEKOSIA_API   = 'https://api.nekosia.cat/api/v1';
const NEKOSAPI_API  = 'https://api.nekosapi.com/v3';

export interface NekosImage {
  id: string;
  url: string;
  palette?: string[];         // from nekosia
  source?: string;
  rating: string;
  gender?: 'male' | 'female' | 'any';
  provider?: string;
}

export interface AniListCharacter {
  id: number;
  name: { full: string; native: string };
  image: { large: string; medium: string };
  description?: string;
  gender?: string;
  media?: { nodes: Array<{ title: { romaji: string } }> };
}

const asSafeText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested =
      asSafeText(record.full) ||
      asSafeText(record.romaji) ||
      asSafeText(record.english) ||
      asSafeText(record.native) ||
      asSafeText(record.name) ||
      asSafeText(record.title);
    return nested || fallback;
  }

  return fallback;
};

const normalizeAniListCharacter = (row: any): AniListCharacter => {
  const mediaNodes = Array.isArray(row?.media?.nodes) ? row.media.nodes : [];
  const normalizedMediaNodes = mediaNodes.map((node: any) => ({
    title: {
      romaji: asSafeText(node?.title?.romaji || node?.title, 'Unknown Anime'),
    },
  }));

  return {
    id: Number(row?.id) || 0,
    name: {
      full: asSafeText(row?.name?.full || row?.name, 'Unknown Character'),
      native: asSafeText(row?.name?.native),
    },
    image: {
      large: asSafeText(row?.image?.large || row?.image?.medium, '/placeholder.svg'),
      medium: asSafeText(row?.image?.medium || row?.image?.large, '/placeholder.svg'),
    },
    description: asSafeText(row?.description),
    gender: asSafeText(row?.gender),
    media: { nodes: normalizedMediaNodes },
  };
};

// ── AniList character search ─────────────────────────────────────────────────
export async function searchAniListCharacters(query: string, page = 1): Promise<AniListCharacter[]> {
  const gql = `
    query ($query: String, $page: Int) {
      Page(page: $page, perPage: 12) {
        characters(search: $query, sort: FAVOURITES_DESC) {
          id
          name { full native }
          image { large medium }
          description(asHtml: false)
          gender
          media(perPage: 3) { nodes { title { romaji } } }
        }
      }
    }
  `;
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { query, page } }),
  });
  if (!res.ok) throw new Error('AniList character search failed');
  const json = await res.json();
  const rows = Array.isArray(json?.data?.Page?.characters) ? json.data.Page.characters : [];
  return rows.map(normalizeAniListCharacter).filter((char) => char.id > 0);
}

// ── Multi-provider random image fetch ────────────────────────────────────────
export async function fetchRandomAnimeImage(options?: {
  rating?: string[];
  tags?: string[];
  limit?: number;
  type?: 'avatar' | 'banner';
  gender?: 'male' | 'female' | 'any';
}): Promise<NekosImage[]> {
  const limit  = options?.limit  ?? 6;
  const gender = options?.gender ?? 'any';
  const isBanner = options?.type === 'banner';
  const images: NekosImage[] = [];

  // ── 1. waifu.im ─────────────────────────────────────────────────────────────
  const waifuImTags = isBanner
    ? ['waifu', 'uniform', 'maid', 'oppai']
    : gender === 'male'
      ? ['husbando']
      : ['waifu', 'neko', 'uniform', 'maid'];

  const waifuImFetch = async () => {
    const tag = waifuImTags[Math.floor(Math.random() * waifuImTags.length)];
    const url = `${WAIFU_IM_API}?included_tags=${tag}&is_nsfw=false&many=true&limit=${Math.min(limit, 30)}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    (data.images ?? []).forEach((img: any, i: number) => {
      images.push({
        id: `waifu-im-${Date.now()}-${i}`,
        url: img.url,
        palette: img.dominant_color ? [img.dominant_color] : undefined,
        source: img.source,
        rating: img.is_nsfw ? 'nsfw' : 'safe',
        gender: gender === 'male' ? 'male' : 'female',
        provider: 'waifu.im',
      });
    });
  };

  // ── 2. Nekosia ───────────────────────────────────────────────────────────────
  const nekosiaFetch = async () => {
    const category = gender === 'male' ? 'boy' : (isBanner ? 'catgirl' : 'catgirl');
    const res = await fetch(`${NEKOSIA_API}/images/${category}?count=${Math.min(limit, 10)}&additionalTags=cute`);
    if (!res.ok) return;
    const data = await res.json();
    (data.images ?? (data.image ? [data] : [])).forEach((item: any, i: number) => {
      const url = item.image?.original?.url ?? item.url;
      if (!url) return;
      images.push({
        id: `nekosia-${Date.now()}-${i}`,
        url,
        palette: item.colors ? Object.values(item.colors).filter(Boolean) as string[] : undefined,
        rating: 'safe',
        gender: gender === 'male' ? 'male' : 'female',
        provider: 'nekosia',
      });
    });
  };

  // ── 3. NekosAPI ──────────────────────────────────────────────────────────────
  const nekosapiImgFetch = async () => {
    const res = await fetch(`${NEKOSAPI_API}/images/random?rating=safe&limit=${Math.min(limit, 10)}`);
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items ?? []);
    items.forEach((img: any, i: number) => {
      if (!img.image_url && !img.url) return;
      images.push({
        id: `nekosapi-${Date.now()}-${i}`,
        url: img.image_url ?? img.url,
        rating: img.rating ?? 'safe',
        gender: 'any',
        provider: 'nekosapi',
      });
    });
  };

  await Promise.allSettled([waifuImFetch(), nekosiaFetch(), nekosapiImgFetch()]);

  // Shuffle and return up to `limit`
  return images.sort(() => Math.random() - 0.5).slice(0, limit);
}

// Hook to fetch random profile images with gender filter
export function useRandomProfileImages(limit = 6, gender: 'male' | 'female' | 'any' = 'any') {
  return useQuery({
    queryKey: ['anime_profile_images', limit, gender],
    queryFn: () => fetchRandomAnimeImage({ limit, type: 'avatar', gender }),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to fetch random banner images
export function useRandomBannerImages(limit = 4) {
  return useQuery({
    queryKey: ['anime_banner_images', limit],
    queryFn: () => fetchRandomAnimeImage({ limit, type: 'banner' }),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to search AniList characters for avatar/banner selection
export function useAniListCharacterSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['anilist_char_search', query],
    queryFn: () => searchAniListCharacters(query),
    enabled: enabled && query.trim().length > 1,
    staleTime: 10 * 60 * 1000,
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
