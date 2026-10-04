import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';
import { getProxiedJsonUrl } from '@/lib/api/proxy-utils';
import type { ProfileAppSettings } from '@/lib/profileSettings';

// ── API Providers (all verified working) ────────────────────────────────────
// Every request goes through the backend's /api/proxy/json passthrough: these
// hosts are protected and answer browsers with a 403/CORS block (waifu.im in
// particular refuses non-browser origins outright, so even the proxy comes back
// 403 — the callers treat that as "empty", not an error).
const WAIFU_IM_API  = 'https://api.waifu.im/search';
const NEKOSIA_API   = 'https://api.nekosia.cat/api/v1';
// nekos.best is not proxy-gated (it answers browsers directly), so it stays
// direct — but it is also not on the /api/proxy/json allowlist, so never wrap it.
const NEKOS_BEST_API = 'https://nekos.best/api/v2';

// nekos.best animated (GIF) categories — anime reaction clips usable as avatars.
const NEKOS_BEST_GIF_CATEGORIES = [
  'hug', 'pat', 'wave', 'wink', 'happy', 'dance',
  'smile', 'blush', 'poke', 'cry', 'bored', 'nod',
];

export interface NekosImage {
  id: string;
  url: string;
  palette?: string[];         // from nekosia
  source?: string;
  rating: string;
  gender?: 'male' | 'female' | 'any';
  provider?: string;
  isGif?: boolean;            // nekos.best animated categories
  animeName?: string;         // nekos.best anime_name / AniList media title
  artistName?: string;        // nekos.best artist_name (attribution)
  mediaId?: number;           // AniList media id (banner search)
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
  const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
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
    const res = await fetch(getProxiedJsonUrl(url));
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
    const res = await fetch(getProxiedJsonUrl(`${NEKOSIA_API}/images/${category}?count=${Math.min(limit, 10)}&additionalTags=cute`));
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
  await Promise.allSettled([waifuImFetch(), nekosiaFetch()]);

  // Shuffle and return up to `limit`
  return images.sort(() => Math.random() - 0.5).slice(0, limit);
}

// ── nekos.best animated GIF avatars ──────────────────────────────────────────
export async function fetchNekosBestGifs(category?: string, amount = 12): Promise<NekosImage[]> {
  // When no category is given, spread the request across a few random categories
  // so the gallery is varied rather than 12 of the same reaction.
  const categories = category
    ? [category]
    : [...NEKOS_BEST_GIF_CATEGORIES].sort(() => Math.random() - 0.5).slice(0, 4);

  const perCategory = Math.max(1, Math.ceil(amount / categories.length));
  const results = await Promise.allSettled(
    categories.map(async (cat) => {
      const res = await fetch(`${NEKOS_BEST_API}/${cat}?amount=${Math.min(perCategory, 20)}`);
      if (!res.ok) return [] as NekosImage[];
      const data = await res.json();
      return (data?.results ?? []).map((r: any, i: number): NekosImage => ({
        id: `nekos-best-${cat}-${Date.now()}-${i}`,
        url: r.url,
        rating: 'safe',
        isGif: true,
        animeName: typeof r.anime_name === 'string' ? r.anime_name : undefined,
        artistName: typeof r.artist_name === 'string' ? r.artist_name : undefined,
        provider: 'nekos.best',
      }));
    }),
  );

  const images = results
    .filter((r): r is PromiseFulfilledResult<NekosImage[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((img) => !!img.url);

  return images.sort(() => Math.random() - 0.5).slice(0, amount);
}

// ── AniList media banner search (title banners) ──────────────────────────────
export async function searchAniListMedia(
  query: string,
  type: 'ANIME' | 'MANGA' = 'ANIME',
): Promise<NekosImage[]> {
  const gql = `
    query ($query: String, $type: MediaType) {
      Page(page: 1, perPage: 18) {
        media(search: $query, type: $type, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          bannerImage
          coverImage { large }
        }
      }
    }
  `;
  const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { query, type } }),
  });
  if (!res.ok) throw new Error('AniList media search failed');
  const json = await res.json();
  const rows = Array.isArray(json?.data?.Page?.media) ? json.data.Page.media : [];
  return rows
    .filter((m: any) => typeof m?.bannerImage === 'string' && m.bannerImage)
    .map((m: any): NekosImage => ({
      id: `anilist-media-${m.id}`,
      url: m.bannerImage,
      rating: 'safe',
      animeName: asSafeText(m?.title?.english || m?.title?.romaji, 'Unknown'),
      mediaId: Number(m?.id) || undefined,
      provider: 'anilist',
    }));
}

// ── waifu.im landscape banners ───────────────────────────────────────────────
export async function fetchWaifuLandscape(limit = 8): Promise<NekosImage[]> {
  const url = `${WAIFU_IM_API}?orientation=LANDSCAPE&is_nsfw=false&many=true&limit=${Math.min(limit, 30)}`;
  // Proxied: a direct browser fetch is blocked with a 403 and a CORS error.
  // waifu.im also refuses the backend proxy's origin, so `res.ok` is often
  // false here — falling back to nekosia below instead of returning an empty
  // gallery (which is the intended empty state only when both fail).
  const res = await fetch(getProxiedJsonUrl(url));
  if (res.ok) {
    const data = await res.json();
    const images = (data?.images ?? [])
      .filter((img: any) => !!img?.url)
      .map((img: any, i: number): NekosImage => ({
        id: `waifu-landscape-${Date.now()}-${i}`,
        url: img.url,
        palette: img.dominant_color ? [img.dominant_color] : undefined,
        source: img.source,
        rating: img.is_nsfw ? 'nsfw' : 'safe',
        provider: 'waifu.im',
      }));
    if (images.length) return images;
  }

  return fetchNekosiaLandscape(limit);
}

/**
 * Landscape banner stand-in for waifu.im. nekosia mostly serves square and
 * tall artwork, so candidates are sized (metadata when present, a real Image
 * probe otherwise) and only genuinely wide ones (>= 1.3 aspect) are kept. The
 * compressed variant is preferred so the picker stays light. Returns [] when
 * nothing is wide enough — the picker then just shows no results for the tab.
 */
async function fetchNekosiaLandscape(limit = 8): Promise<NekosImage[]> {
  const MIN_WIDTH = 720;
  const MIN_ASPECT = 1.3;

  const results = await Promise.allSettled(
    ['catgirl', 'uniform', 'cosplay'].map(async (category) => {
      const res = await fetch(getProxiedJsonUrl(`${NEKOSIA_API}/images/${category}?count=14`));
      if (!res.ok) return [] as NekosImage[];
      const data = await res.json();
      const images = Array.isArray(data?.images) ? data.images : [];

      const candidates = images.filter((item: any) => {
        const meta = item?.metadata;
        // nekosia nests dimensions under metadata.original / metadata.compressed
        const dims =
          meta && typeof meta.width === 'number' && typeof meta.height === 'number'
            ? { w: meta.width, h: meta.height }
            : meta?.compressed && typeof meta.compressed.width === 'number'
              ? { w: meta.compressed.width, h: meta.compressed.height }
              : meta?.original && typeof meta.original.width === 'number'
                ? { w: meta.original.width, h: meta.original.height }
                : null;
        return dims !== null && dims.w >= MIN_WIDTH && dims.w / dims.h >= MIN_ASPECT;
      });

      return candidates
        .map((item: any, i: number): NekosImage | null => {
          const url =
            item?.image?.compressed?.url ?? item?.image?.original?.url;
          if (!url) return null;
          return {
            id: `nekosia-landscape-${category}-${item?.id ?? i}`,
            url,
            palette: Array.isArray(item?.colors?.palette) ? item.colors.palette : undefined,
            source: typeof item?.source?.url === 'string' ? item.source.url : undefined,
            rating: 'safe',
            provider: 'nekosia',
          };
        })
        .filter((img: NekosImage | null): img is NekosImage => !!img);
    }),
  );

  const all = results
    .filter((r): r is PromiseFulfilledResult<NekosImage[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  // One probe per URL keeps the picker snappy even for the largest result set.
  const checked = await Promise.all(all.map(async (img) => {
    const { w, h } = await probeImageSize(img.url);
    return w >= MIN_WIDTH && w / h >= MIN_ASPECT ? img : null;
  }));

  return checked
    .filter((img): img is NekosImage => img !== null)
    .slice(0, limit);
}

/** Read a remote image's natural size (for aspect filtering); never throws. */
function probeImageSize(url: string, timeoutMs = 4000): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (w: number, h: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({ w, h });
    };
    const timer = window.setTimeout(() => finish(0, 0), timeoutMs);
    const img = new Image();
    img.onload = () => finish(img.naturalWidth, img.naturalHeight);
    img.onerror = () => finish(0, 0);
    img.src = url;
  });
}

// Hook to fetch random animated GIF avatars
export function useRandomAvatarGifs(limit = 12) {
  return useQuery({
    queryKey: ['anime_avatar_gifs', limit],
    queryFn: () => fetchNekosBestGifs(undefined, limit),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to search AniList media banners for the banner picker
export function useAniListMediaSearch(query: string, type: 'ANIME' | 'MANGA' = 'ANIME', enabled = true) {
  return useQuery({
    queryKey: ['anilist_media_banner', type, query],
    queryFn: () => searchAniListMedia(query, type),
    enabled: enabled && query.trim().length > 1,
    staleTime: 10 * 60 * 1000,
  });
}

// Hook to fetch landscape waifu.im banners
export function useWaifuLandscapeBanners(limit = 8) {
  return useQuery({
    queryKey: ['waifu_landscape', limit],
    queryFn: () => fetchWaifuLandscape(limit),
    staleTime: 5 * 60 * 1000,
  });
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

// Update profile customization (ambient color + background effect) stored in the
// app_settings jsonb. Merges into the existing app_settings so unrelated keys are
// preserved. Batch ambientColor + backgroundEffect into ONE call per save to avoid
// a read-modify-write race.
export function useUpdateProfileSettings() {
  const queryClient = useQueryClient();
  const { user, profile, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (patch: NonNullable<ProfileAppSettings['profile']>) => {
      if (!user) throw new Error('Not logged in');

      const current = ((profile as any)?.app_settings ?? {}) as ProfileAppSettings;
      const merged: ProfileAppSettings = {
        ...current,
        profile: { ...(current.profile ?? {}), ...patch },
      };

      const { error } = await supabase
        .from('profiles')
        .update({ app_settings: merged })
        .eq('user_id', user.id);

      if (error) {
        // The profiles.app_settings column is not in the deployed schema yet
        // (migration 20260902000003 written but not applied) — PostgREST reports
        // PGRST204 / 42703. Surface an actionable message instead of the raw code.
        const msg = `${error.message} ${(error as any).details ?? ''}`.toLowerCase();
        if ((error as any).code === '42703' || (error as any).code === 'PGRST204' || msg.includes('app_settings')) {
          throw new Error(
            'Profile customization needs the profiles.app_settings column, which is missing from the database. Apply migration 20260902000003_profiles_column_level_update.sql (or add the column) and reload the schema cache.',
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['public_profile'] });
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
        // Bounded but high enough that a viewed user's derived rank/episode count
        // isn't capped (was 50, which undercounted ranks past the first 50 eps).
        .limit(2000);

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
