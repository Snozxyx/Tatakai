/**
 * AnimePage.tsx
 * Dynamic Anime detail and episode listing page.
 * Features:
 * - Dynamic Video Background Hero
 * - Intelligent episode grouping
 * - Series Relation Tree matching the Watch Order rail design
 * - Integration with Jikan for HQ covers
 */

import { useMemo, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ANILIST_GRAPHQL_ENDPOINT, resolveApiV3Base } from "@/lib/api/backendOrigin";
import { useAnimeInfo, useEpisodes, useNextEpisodeSchedule } from "@/hooks/api/useAnimeData";
import { useAnimeSeasons } from "@/hooks/api/useAnimeSeasons";
import { useAniListRecommendations } from "@/hooks/api/useAniListRecommendations";
import { useRecommendationEngine } from "@/hooks/api/useRecommendationEngine";
import { useAuth } from "@/contexts/AuthContext";
import { ContentEditSheet, type EditableColumns } from "@/components/admin/ContentEditSheet";
import { Button } from "@/components/ui/button";
import { contentGraph, toAnimeCard } from "@/core";
import type { MediaRelation } from "@/core/content/types";
import type { AnimeCard } from "@/types/anime";
import { Background } from "@/components/layout/Background";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { VideoBackground } from "@/components/anime/VideoBackground";
import { EpisodeComments } from "@/components/video/EpisodeComments";
import { RatingsSection } from "@/components/anime/RatingsSection";
import { AnimeCommunityPosts } from "@/components/anime/AnimeCommunityPosts";
import { WatchlistButton } from "@/components/anime/WatchlistButton";
import { ShareButton } from "@/components/anime/ShareButton";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { OpenInAppButton } from "@/components/common/OpenInAppButton";
import { NextEpisodeSchedule } from "@/components/anime/NextEpisodeSchedule";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getProxiedImageUrl, fetchJikanCover, fetchProducerAnimes } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Search,
  ArrowLeft,
  Play,
  Star,
  Calendar,
  Clock,
  Film,
  Tv,
  Layers,
  Users,
  Download,
  CloudDownload,
  Sparkles,
  PenTool,
  ExternalLink as ExternalLinkIcon,
  GitGraph,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  Tag,
  Pencil,
  Database,
  CheckCircle2,
} from "lucide-react";
import { SeasonDownloadModal } from "@/components/anime/SeasonDownloadModal";
import { Helmet } from "react-helmet-async";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fetchCombinedSources } from "@/lib/api";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { setViewingRpc, clearDiscordRpc } from '@/lib/discordRpc';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Capacitor } from '@capacitor/core';

const EPISODES_PER_GROUP = 24;

import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { AdultWarningGate } from "@/components/content/AdultWarningGate";

// --- Helper Component: Relation Tree ---
// Renders the "Series Tree" relations with the SAME 16:9 rail card design as the
// Watch Order section (rounded cover, top-left status badge, "N EPS" pill,
// title + format · year meta below) so related-media reads consistently across
// the page. Relations carry no rating, so that segment is simply omitted.
function RelationTree({ relations }: { relations: MediaRelation[] }) {
  if (relations.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth">
      {relations.map((rel, index) => {
        const fmt = rel.format?.toUpperCase() || '';
        const isNovel = fmt.includes('NOVEL');
        const isManga = fmt.includes('MANGA') || fmt.includes('ONE_SHOT');
        const to = isNovel ? '/novel/comingsoon' : isManga ? `/manga/${rel.id}` : `/anime/${rel.id}`;
        const title = rel.titleEnglish || rel.titleRomaji || 'Untitled';
        const relLabel = (rel.relationType || 'RELATED').replace(/_/g, ' ');
        const year = rel.seasonYear || rel.startDate?.year;

        return (
          <Link
            key={`${rel.id}-${index}`}
            to={to}
            className="group flex-shrink-0 w-60 sm:w-64 md:w-72 block transition-transform"
          >
            <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-muted/40 transition-all duration-300 hover:scale-[1.03] hover:ring-2 hover:ring-white/40">
              <img
                src={getProxiedImageUrl(rel.coverImage || '')}
                alt={title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

              {/* Relation type badge — top-left */}
              <div className="absolute top-2.5 left-2.5">
                <span className="px-2.5 py-1 rounded-md bg-black/80 text-white text-[11px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/10 shadow-md">
                  {relLabel}
                </span>
              </div>

              {/* Episode count badge — bottom-right */}
              {rel.episodes ? (
                <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/10 shadow-md">
                  {rel.episodes} EPS
                </div>
              ) : null}
            </div>

            {/* Title & Metadata below card */}
            <div className="mt-2.5 px-1">
              <h4
                className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors"
                title={title}
              >
                {title}
              </h4>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
                <span>{rel.format || 'TV'}</span>
                {year && (
                  <>
                    <span>·</span>
                    <span>{year}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function AnimePage() {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const routeAnimeId = animeId;
  const { isAdmin } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: animeData, isLoading: loadingInfo, error: animeError } = useAnimeInfo(routeAnimeId);
  const { data: mappingDebug } = useQuery({
    queryKey: ["anime-mapping-debug", routeAnimeId],
    queryFn: async () => {
      if (!routeAnimeId) return null;
      const res = await fetch(`${resolveApiV3Base()}/content/${encodeURIComponent(routeAnimeId)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    },
    enabled: !!routeAnimeId,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !mappingDebug) return;
    
    // Extract any additional mapping IDs from debug data
    const tmdbId = mappingDebug.tmdbId || mappingDebug.media?.tmdbId || 
                 mappingDebug.media?.externalLinks?.find((l: any) => l.site.toLowerCase() === 'tmdb')?.url.split('/').pop();

    console.debug("[AnimePage] Comprehensive Mapping Debug", {
      tatakaiId: mappingDebug.media?.tatakaiId || mappingDebug.id,
      anilistId: mappingDebug.media?.anilistId || mappingDebug.anilistId,
      malId: mappingDebug.media?.malId || mappingDebug.malId,
      tmdbId,
      source: mappingDebug.source || mappingDebug.media?.source_api,
      raw: mappingDebug
    });
  }, [mappingDebug]);

  const anilistId = animeData?.moreInfo?.anilistId || mappingDebug?.media?.anilistId || mappingDebug?.anilistId || null;
  const parsedAniListId = useMemo(() => {
    if (anilistId != null) {
      const num = Number(anilistId);
      if (Number.isFinite(num) && num > 0) return num;
    }
    const rawId = routeAnimeId || '';
    const numericMatch = rawId.match(/^anilist[:_-]?(\d+)$/i) || rawId.match(/^(\d+)$/);
    if (numericMatch?.[1]) {
      const num = Number(numericMatch[1]);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return undefined;
  }, [anilistId, routeAnimeId]);

  const previewTitles = useMemo(() => {
    if (!animeData?.info?.name) return [];
    return [
      animeData.info.name,
      (animeData.info as any).japaneseName,
      (animeData.info as any).englishName,
    ].filter(Boolean) as string[];
  }, [animeData?.info]);

  const contentAnimeId = useMemo(() => {
    if (anilistId && Number.isFinite(Number(anilistId))) return String(anilistId);
    if (!routeAnimeId) return undefined;
    return routeAnimeId;
  }, [routeAnimeId, anilistId]);

  const seasonsQueryId = useMemo(() => {
    if (anilistId && Number.isFinite(Number(anilistId))) return String(anilistId);
    if (routeAnimeId && /^\d+$/.test(routeAnimeId)) return routeAnimeId;
    return undefined;
  }, [anilistId, routeAnimeId]);

  const { data: seasonsData } = useAnimeSeasons(seasonsQueryId);
  const watchOrderScrollRef = useRef<HTMLDivElement>(null);

  // Tags query from AniList (with fallback to moreInfo.tags)
  const { data: directAniListTags = [] } = useQuery({
    queryKey: ['anime-tags-direct', parsedAniListId],
    queryFn: async () => {
      if (!parsedAniListId) return [];
      const gql = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            tags {
              id
              name
              category
              rank
              isMediaSpoiler
              isGeneralSpoiler
              isAdult
            }
          }
        }
      `;
      try {
        const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gql, variables: { id: parsedAniListId } }),
        });
        if (!res.ok) return [];
        const json = await res.json();
        return (json?.data?.Media?.tags ?? []) as Array<{
          id: number;
          name: string;
          category?: string;
          rank?: number;
          isMediaSpoiler?: boolean;
          isGeneralSpoiler?: boolean;
          isAdult?: boolean;
        }>;
      } catch {
        return [];
      }
    },
    enabled: Boolean(parsedAniListId),
    staleTime: 60 * 60 * 1000,
  });

  const animeTags = useMemo(() => {
    const raw = directAniListTags.length > 0 ? directAniListTags : ((animeData?.moreInfo?.tags || []) as any[]);
    return raw.filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler);
  }, [directAniListTags, animeData?.moreInfo?.tags]);

  const [selectedEpisodeGroup, setSelectedEpisodeGroup] = useState(0);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodeLayout, setEpisodeLayout] = useState<"grid" | "compact">("compact");

  const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(contentAnimeId);
  const { data: nextEpisodeSchedule } = useNextEpisodeSchedule(contentAnimeId);

  /**
   * Episodes matching the search box, or all of them when it is empty.
   *
   * Matches the number, the title, every localized title ani.zip carries and the
   * synopsis — so "temple" finds the episode by what happens in it, not just by
   * what it is called.
   */
  const filteredEpisodes = useMemo(() => {
    const episodes = episodesData?.episodes || [];
    const needle = episodeQuery.trim().toLowerCase();
    if (!needle) return episodes;

    return episodes.filter((ep) => {
      if (String(ep.number) === needle) return true;
      const haystack = [
        ep.title,
        ep.overview,
        ...Object.values(ep.titles ?? {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [episodesData?.episodes, episodeQuery]);

  const episodeGroups = useMemo(() => {
    const episodes = filteredEpisodes;
    if (episodes.length <= EPISODES_PER_GROUP) return [episodes];

    const groups: typeof episodes[] = [];
    for (let index = 0; index < episodes.length; index += EPISODES_PER_GROUP) {
      groups.push(episodes.slice(index, index + EPISODES_PER_GROUP));
    }
    return groups;
  }, [filteredEpisodes]);

  /**
   * Thumbnails are only worth a card grid if there are thumbnails. ani.zip covers
   * most catalogued shows but not all, and a wall of empty 16:9 boxes reads worse
   * than the numbered pills, so the default follows the data.
   */
  const episodesHaveThumbnails = useMemo(() => {
    const episodes = episodesData?.episodes || [];
    if (episodes.length === 0) return false;
    const withImage = episodes.filter((ep) => Boolean(ep.image)).length;
    return withImage / episodes.length >= 0.5;
  }, [episodesData?.episodes]);

  useEffect(() => {
    setEpisodeLayout(episodesHaveThumbnails ? "grid" : "compact");
  }, [episodesHaveThumbnails]);

  // A filtered-down list has its own grouping; jumping back to the first group
  // keeps the range buttons and the rendered slice in agreement.
  useEffect(() => {
    setSelectedEpisodeGroup(0);
  }, [episodeQuery]);

  // Get MAL/AniList IDs from Tatakai API response
  const malId = animeData?.moreInfo?.malId || null;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[AnimePage] External IDs Debug", {
      routeAnimeId,
      contentAnimeId,
      malId,
      anilistId,
      hasAnimeData: Boolean(animeData),
    });
  }, [routeAnimeId, contentAnimeId, malId, anilistId, Boolean(animeData)]);

  // Fetch highest quality cover from Jikan (MAL large_image_url) when malId is known
  const { data: hqPoster } = useQuery({
    queryKey: ['jikan-cover', malId],
    queryFn: () => fetchJikanCover(malId, animeData?.info?.poster ?? ''),
    enabled: !!malId,
    staleTime: 1000 * 60 * 60 * 24, // 24h — covers don't change often
  });

  const producerNames = useMemo<string[]>(() => {
    const rawProducers = animeData?.moreInfo?.producers;
    const fromPayload = Array.isArray(rawProducers)
      ? rawProducers.map((producer) => String(producer || '').trim()).filter(Boolean)
      : [];

    if (fromPayload.length > 0) {
      return Array.from(new Set(fromPayload));
    }

    const studioText = String(rawProducers || animeData?.moreInfo?.studios || '').trim();
    if (!studioText) return [];

    return Array.from(
      new Set(
        studioText
          .split(',')
          .map((studio) => studio.trim())
          .filter(Boolean)
      )
    );
  }, [animeData?.moreInfo?.producers, animeData?.moreInfo?.studios]);

  const producerRequestCandidates = useMemo(() => {
    const slugifyProducer = (value: string) => {
      return value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    };

    const candidates: string[] = [];
    for (const producer of producerNames) {
      const slug = slugifyProducer(producer);
      if (slug) candidates.push(slug);
      candidates.push(producer);
    }

    return Array.from(new Set(candidates.map((value) => value.trim()).filter(Boolean)));
  }, [producerNames]);

  const { data: producerAnimeData } = useQuery({
    queryKey: ['producer-anime', producerRequestCandidates],
    queryFn: async () => {
      for (const candidate of producerRequestCandidates) {
        try {
          const response = await fetchProducerAnimes(candidate, 1);
          if (Array.isArray(response?.animes) && response.animes.length > 0) {
            return response;
          }
        } catch {
          // Try the next candidate (slug/raw producer variant).
        }
      }

      return null;
    },
    enabled: producerRequestCandidates.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const producerAnimes = useMemo(() => {
    const currentId = String(contentAnimeId || '').trim().toLowerCase();
    const rows = Array.isArray(producerAnimeData?.animes) ? producerAnimeData.animes : [];

    return rows
      .filter((anime) => String(anime?.id || '').trim().toLowerCase() !== currentId)
      .slice(0, 6);
  }, [producerAnimeData?.animes, contentAnimeId]);
  

  const isNative = useIsNativeApp(); // Any native app (desktop or mobile)
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobileNative = useIsMobileApp(); // Only Capacitor (Android/iOS)
  const isMobile = useIsMobile(); // Screen width based check

  useEffect(() => {
    const title = animeData?.info?.name;
    if (!title) return;
    setViewingRpc({
      animeTitle: title,
      animeImageUrl: animeData?.info?.poster,
      animeUrl: `https://tatakai.me/anime/${contentAnimeId}`,
    });
    return () => {
      clearDiscordRpc();
    };
  }, [animeData?.info?.name, animeData?.info?.poster, contentAnimeId]);
  
  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile;
  
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // ── Mature-content gate ──────────────────────────────────────────────────────
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } =
    useContentSafetySettings();
  const [allowAdultForSession, setAllowAdultForSession] = useState(false);

  // handleDownloadEpisode removed as per user request to only keep season download here

  // Use HiAnime seasons directly - they have proper season titles like "Season 1", "Season 2", etc.
  const allSeasons = Array.isArray(seasonsData) ? seasonsData : [];

  // Auto-select episode 1 when clicking watch
  const handleWatchNow = () => {
    if (episodesData?.episodes[0]) {
      navigate(`/watch/${encodeURIComponent(episodesData.episodes[0].episodeId)}`);
    }
  };

  const handleEpisodeClick = (episodeId: string) => {
    navigate(`/watch/${encodeURIComponent(episodeId)}`);
  };

  const info = animeData?.info;
  const moreInfo = animeData?.moreInfo;

  const relatedAnime = useMemo<AnimeCard[]>(() => {
    if (!info || !moreInfo) return [];
    const relations = (moreInfo.relations || []) as MediaRelation[];
    const seen = new Set<string>();
    return relations
      .map((rel) => {
        const id = String(rel.id || '').trim();
        if (!id) return null;
        if (String(contentAnimeId || '') === id) return null;
        if (seen.has(id)) return null;
        
        const isManga = rel.format && ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(rel.format as any);
        if (isManga) return null;

        seen.add(id);
        return {
          id,
          name: rel.titleEnglish ?? rel.titleRomaji ?? "Untitled",
          poster: rel.coverImage || info.poster,
          type: rel.format || undefined,
          episodes: { sub: 0, dub: 0 },
          mediaType: 'anime',
        } as any;
      })
      .filter(Boolean) as AnimeCard[];
  }, [moreInfo, info, contentAnimeId]);

  const relatedManga = useMemo<AnimeCard[]>(() => {
    if (!info || !moreInfo) return [];
    const relations = (moreInfo.relations || []) as MediaRelation[];
    const seen = new Set<string>();
    return relations
      .map((rel) => {
        const id = String(rel.id || '').trim();
        if (!id) return null;
        if (String(contentAnimeId || '') === id) return null;
        if (seen.has(id)) return null;

        const isManga = rel.format && ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(rel.format as any);
        if (!isManga) return null;

        seen.add(id);
        return {
          id,
          name: rel.titleEnglish ?? rel.titleRomaji ?? "Untitled",
          poster: rel.coverImage || info.poster,
          type: rel.format || undefined,
          episodes: { sub: 0, dub: 0 },
          mediaType: 'manga',
        } as any;
      })
      .filter(Boolean) as AnimeCard[];
  }, [moreInfo, info, contentAnimeId]);

  const genreSeeds = useMemo(
    () => (moreInfo?.genres || []).filter(Boolean).slice(0, 2),
    [moreInfo?.genres]
  );
  const { data: recommendationRows } = useQuery({
    queryKey: ["anime-recommendations", contentAnimeId, genreSeeds.join("|")],
    queryFn: async () => {
      if (genreSeeds.length === 0) return [] as AnimeCard[];
      const result = await contentGraph.search({
        genres: genreSeeds,
        page: 1,
        perPage: 12,
        sortBy: "POPULARITY_DESC",
        isAdult: false,
      });
      return result.media.map(toAnimeCard);
    },
    enabled: genreSeeds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // AniList's crowd-curated picks for this exact title (mirror-proxied, never direct).
  const includeAdultRecs = !!contentSafetySettings?.showAdultEverywhere;
  const { recommendations: anilistRecs } = useAniListRecommendations(parsedAniListId, {
    mediaType: "ANIME",
    includeAdult: includeAdultRecs,
    limit: isMobile ? 12 : 24,
  });
  // The app's own personalized engine (same source as the Recommendations page).
  const { recommendations: engineRecs } = useRecommendationEngine({ limit: isMobile ? 12 : 24 });

  // Merge AniList (primary) + engine (personalized) + genre-search (fallback),
  // deduped by id and with the current title removed.
  const recommendedAnimes = useMemo<AnimeCard[]>(() => {
    const currentId = String(contentAnimeId || "");
    const seen = new Set<string>();
    const out: AnimeCard[] = [];
    const push = (card: AnimeCard | null | undefined) => {
      if (!card) return;
      const id = String(card.id || "").trim();
      if (!id || id === currentId || seen.has(id)) return;
      seen.add(id);
      out.push(card);
    };

    for (const r of anilistRecs) {
      push({
        id: String(r.anilistId),
        name: r.title,
        jname: r.jtitle,
        poster: r.poster,
        type: r.format ?? undefined,
        rating: r.averageScore ? (r.averageScore / 10).toFixed(1) : undefined,
        episodes: { sub: 0, dub: 0 },
        malId: r.malId ?? undefined,
        anilistId: r.anilistId,
        isAdult: r.isAdult,
        year: r.seasonYear ?? undefined,
        mediaType: "anime",
      } as AnimeCard);
    }

    for (const rec of engineRecs) {
      const a = rec.anime;
      push({
        id: String(a.id),
        name: a.title,
        poster: a.poster ?? "",
        type: a.format ?? undefined,
        rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : undefined,
        episodes: { sub: 0, dub: 0 },
        malId: a.malId ?? undefined,
        anilistId: a.anilistId ?? undefined,
        year: a.year ?? undefined,
        mediaType: "anime",
      } as AnimeCard);
    }

    for (const row of recommendationRows || []) {
      push({ ...(row as AnimeCard), mediaType: "anime" } as AnimeCard);
    }

    return out.slice(0, isMobile ? 10 : 14);
  }, [anilistRecs, engineRecs, recommendationRows, contentAnimeId, isMobile]);

  useEffect(() => {
    setSelectedEpisodeGroup(0);
  }, [contentAnimeId]);

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Background />
        <main
          className={cn(
            "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32",
          )}
        >
          <div className="space-y-8">
            <Skeleton className="h-8 w-32" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Skeleton className="aspect-[2/3] rounded-3xl" />
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-24 w-full" />
                <div className="flex gap-4">
                  <Skeleton className="h-14 w-40 rounded-full" />
                  <Skeleton className="h-14 w-14 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (!animeData) {
    // Diagnostics: surface exactly why the lookup failed for this route id so
    // "certain anime" failures are inspectable in the console.
    console.warn('[AnimePage] Anime details not available', {
      routeAnimeId,
      resolvedAnilistId: anilistId,
      error: animeError instanceof Error ? animeError.message : animeError,
      hint: 'Set localStorage.tatakaiMediaDebug="1" and reload for the full [getMedia] resolution trace.',
    });
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Anime details not available</h1>
          <p className="text-muted-foreground mb-4">We couldn't retrieve the information for this anime ID.</p>
          {import.meta.env.DEV && animeError instanceof Error && (
            <pre className="text-xs text-destructive/80 max-w-md mx-auto mb-4 whitespace-pre-wrap break-words">
              {`id: ${routeAnimeId}\n${animeError.message}`}
            </pre>
          )}
          <button onClick={() => navigate("/")} className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:brightness-110">
            Go back home
          </button>
        </div>
      </div>
    );
  }

  const totalEpisodes = episodesData?.episodes?.length || 0;
  const matchedEpisodes = filteredEpisodes.length;
  const isFilteringEpisodes = episodeQuery.trim().length > 0;
  // The search box appears at the point the plain grid stops being scannable.
  const showEpisodeToolbar = totalEpisodes > EPISODES_PER_GROUP || episodesHaveThumbnails;
  const hasEpisodeGroups = matchedEpisodes > EPISODES_PER_GROUP;
  const activeEpisodeGroup = Math.min(selectedEpisodeGroup, Math.max(episodeGroups.length - 1, 0));
  const visibleEpisodes = episodeGroups[activeEpisodeGroup] || filteredEpisodes;

  // Drop the alias that already reads as the page heading so the list doesn't
  // start by repeating the title above it.
  const titleAliases = ((moreInfo?.titleAliases as string[] | undefined) ?? []).filter(
    (alias) => alias.toLowerCase() !== String(info?.name ?? '').toLowerCase()
  );

  if (!info || !moreInfo) return null;

  const requiresAdultWarning =
    Boolean(animeData.isAdult) &&
    contentSafetySettings.warnBeforeAdultOpen &&
    !allowAdultForSession;

  if (requiresAdultWarning) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Background />
        <main
          className={cn(
            "relative z-10 py-8 max-w-[980px] mx-auto pb-24",
            isDesktopApp ? "px-4" : "pl-6 md:pl-32 pr-6",
          )}
        >
          <AdultWarningGate
            title={info.name}
            mediaLabel="anime"
            onBack={() => navigate(-1)}
            onContinue={() => setAllowAdultForSession(true)}
            onAlwaysShow={() => {
              updateContentSafetySettings({
                showAdultEverywhere: true,
                warnBeforeAdultOpen: false,
              });
              setAllowAdultForSession(true);
            }}
          />
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{info.name} — Anime on Tatakai</title>
        <meta name="description" content={info.description?.slice(0, 160) || `Track ${info.name}, rate it, and add it to your lists on Tatakai.`} />
        <meta property="og:title" content={`${info.name} — Anime on Tatakai`} />
        <meta property="og:description" content={info.description?.slice(0, 160) || `Track and discuss ${info.name} on Tatakai — the otaku community.`} />
        <meta property="og:image" content={info.poster} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`${window.location.origin}/anime/${contentAnimeId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${info.name} — Anime on Tatakai`} />
        <meta name="twitter:description" content={info.description?.slice(0, 100) || `${info.name} on Tatakai`} />
        <meta name="twitter:image" content={info.poster} />
        <link rel="canonical" href={`${window.location.origin}/anime/${contentAnimeId}`} />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {/* Video Background Hero */}
        <VideoBackground
          animeId={contentAnimeId!}
          poster={info.poster}
          anilistId={parsedAniListId}
          titles={previewTitles}
        >
          <main className={cn(
            "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32" // Original web padding
          )}>
            {/* Back Button */}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>

            {/* Hero Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 pt-12 md:pt-24">
              {/* Poster */}
              <GlassPanel className="overflow-hidden self-start">
                <img
                  src={hqPoster ?? getProxiedImageUrl(info.poster)}
                  alt={info.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              </GlassPanel>

              {/* Info */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                    {info.name}
                  </h1>
                  <ExtensionSlot slotId="anime-details-after-title" props={{ anime: animeData }} />

                  {/* Provenance badge (all visitors) + admin edit button */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {moreInfo?.inDb ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        In Tatakai DB
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        <Database className="w-3.5 h-3.5" />
                        Not in DB yet
                      </span>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit content
                      </Button>
                    )}
                  </div>

                  {isAdmin && moreInfo && (
                    <ContentEditSheet
                      open={editOpen}
                      onOpenChange={setEditOpen}
                      mediaType="anime"
                      title={info.name}
                      id={
                        (moreInfo.anilistId ? String(moreInfo.anilistId) : "") ||
                        moreInfo.tatakaiId ||
                        routeAnimeId ||
                        ""
                      }
                      initial={{
                        title_romaji: moreInfo.titleRomaji ?? "",
                        title_english: moreInfo.titleEnglish ?? "",
                        title_native: moreInfo.titleNative ?? "",
                        description: info.description ?? "",
                        cover_image_large: moreInfo.coverImageLarge ?? "",
                        cover_image_medium: moreInfo.coverImageMedium ?? "",
                        banner_image: moreInfo.bannerImage ?? "",
                        trailer_url: moreInfo.trailerUrl ?? "",
                        format: moreInfo.formatRaw ?? "",
                        status: moreInfo.statusRaw ?? "",
                        source: moreInfo.source ?? "",
                        country_of_origin: moreInfo.countryOfOrigin ?? "",
                        rating: moreInfo.rating ?? "",
                        season: moreInfo.season ?? "",
                        season_year: moreInfo.seasonYear ?? "",
                        episodes: moreInfo.episodesTotal ?? "",
                        duration: moreInfo.durationMin ?? "",
                        episode_sub_count: moreInfo.episodeSubCount ?? "",
                        episode_dub_count: moreInfo.episodeDubCount ?? "",
                        average_score: moreInfo.averageScore ?? "",
                        mean_score: moreInfo.meanScore ?? "",
                        popularity: moreInfo.popularity ?? "",
                        favourites: moreInfo.favourites ?? "",
                        genres: (moreInfo.genres ?? []).join(", "),
                      } satisfies Partial<EditableColumns>}
                    />
                  )}


                  {/* Stats */}
                  <div className="flex flex-wrap gap-4 mb-6">
                    {info.stats.rating && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/20 text-amber">
                        <Star className="w-4 h-4 fill-amber" />
                        <span className="font-bold">{info.stats.rating}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <Tv className="w-4 h-4" />
                      <span>{info.stats.type}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <Clock className="w-4 h-4" />
                      <span>{info.stats.duration}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary">
                      <Film className="w-4 h-4" />
                      <span>SUB: {info.stats.episodes.sub}</span>
                    </div>
                    {info.stats.episodes.dub > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/20 text-secondary">
                        <Film className="w-4 h-4" />
                        <span>DUB: {info.stats.episodes.dub}</span>
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {moreInfo.genres?.map((genre, index) => (
                      <span
                        key={`${genre}-${index}`}
                        onClick={() => navigate(`/genre/${genre.toLowerCase()}`)}
                        className="px-3 py-1 rounded-full border border-border text-sm cursor-pointer hover:bg-muted transition-colors"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>

                  {/* Tags */}
                  {animeTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-6">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-primary" />
                        Tags:
                      </span>
                      {animeTags.slice(0, 16).map((tag: any) => (
                        <button
                          key={tag.id || tag.name}
                          type="button"
                          onClick={() => navigate(`/search?animeTag=${encodeURIComponent(tag.name)}&type=anime`)}
                          className="px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all flex items-center gap-1 group"
                          title={tag.category ? `${tag.category} • Click to search` : 'Click to search'}
                        >
                          <span>{tag.name}</span>
                          {typeof tag.rank === 'number' && (
                            <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary/70">
                              {tag.rank}%
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-muted-foreground leading-relaxed">
                    {info.description}
                  </p>

                  {/* Also known as — AniList titles + synonyms + ani.zip's localized
                      titles. Collapsed by default because popular shows can carry
                      15+ aliases and they would otherwise bury the synopsis. */}
                  {titleAliases.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none inline-flex items-center gap-1">
                        Also known as
                        <span className="text-[10px] opacity-60">({titleAliases.length})</span>
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {titleAliases.map((alias) => (
                          <span
                            key={alias}
                            className="px-2 py-0.5 rounded-md bg-muted/60 text-xs text-muted-foreground"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* More Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {moreInfo.aired && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Aired</span>
                      <p className="font-medium flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {moreInfo.aired}
                      </p>
                    </div>
                  )}
                  {moreInfo.status && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                      <p className="font-medium mt-1">{moreInfo.status}</p>
                    </div>
                  )}
                  {moreInfo.studios && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Studios</span>
                      <p 
                        className="font-medium mt-1 hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/search/producer/${encodeURIComponent(moreInfo.studios)}`)}
                      >
                        {moreInfo.studios}
                      </p>
                    </div>
                  )}
                  {(moreInfo.season || moreInfo.year) && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Season</span>
                      <p className="font-medium mt-1 capitalize">{moreInfo.season} {moreInfo.year}</p>
                    </div>
                  )}
                  {moreInfo.source && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Source</span>
                      <p className="font-medium mt-1 capitalize">{String(moreInfo.source).toLowerCase().replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {moreInfo.duration && moreInfo.duration !== "Unknown" && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Duration</span>
                      <p className="font-medium mt-1 flex items-center gap-2"><Clock className="w-4 h-4" />{moreInfo.duration}</p>
                    </div>
                  )}
                  {moreInfo.countryOfOrigin && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Country</span>
                      <p className="font-medium mt-1">{moreInfo.countryOfOrigin}</p>
                    </div>
                  )}
                  {typeof moreInfo.meanScore === "number" && moreInfo.meanScore > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Mean score</span>
                      <p className="font-medium mt-1">{moreInfo.meanScore}%</p>
                    </div>
                  )}
                  {typeof moreInfo.popularity === "number" && moreInfo.popularity > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Popularity</span>
                      <p className="font-medium mt-1">#{moreInfo.popularity.toLocaleString()}</p>
                    </div>
                  )}
                  {typeof moreInfo.favourites === "number" && moreInfo.favourites > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Favourites</span>
                      <p className="font-medium mt-1">{moreInfo.favourites.toLocaleString()}</p>
                    </div>
                  )}
                  {moreInfo.endDate && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Ended</span>
                      <p className="font-medium mt-1 flex items-center gap-2"><Calendar className="w-4 h-4" />{moreInfo.endDate}</p>
                    </div>
                  )}
                  {producerNames.length > 0 && (
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Producers</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {producerNames.map((producer) => (
                          <button
                            key={producer}
                            type="button"
                            onClick={() => navigate(`/search/producer/${encodeURIComponent(producer)}`)}
                            className="px-3 py-1 rounded-full border border-border text-sm hover:bg-muted transition-colors"
                          >
                            {producer}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* AniList rankings (highest rated / most popular, all-time + seasonal) */}
                {Array.isArray(moreInfo.rankings) && moreInfo.rankings.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {moreInfo.rankings
                      .slice()
                      .sort((a, b) => (a.allTime === b.allTime ? a.rank - b.rank : a.allTime ? -1 : 1))
                      .slice(0, 6)
                      .map((ranking) => (
                        <span
                          key={ranking.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary capitalize"
                          title={ranking.context}
                        >
                          {ranking.type === 'RATED' ? <Star className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                          #{ranking.rank} {ranking.context}
                        </span>
                      ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-4">
                  <button
                    onClick={handleWatchNow}
                    disabled={loadingEpisodes || !episodesData?.episodes[0]}
                    className="h-12 sm:h-14 px-6 sm:px-8 rounded-full bg-foreground text-background font-bold text-base sm:text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 glow-primary disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-background" />
                    Watch Now
                  </button>
                  <WatchlistButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                    malId={malId || moreInfo.malId || null}
                    anilistId={anilistId || moreInfo.anilistId || null}
                  />
                  <AddToPlaylistButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                  />
                  <ShareButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    description={info.description}
                  />
                  <OpenInAppButton size="lg" className="h-12 sm:h-14 rounded-full" label="Open in app" />
                  <button
                    onClick={() => navigate(`/isshoni?anime=${encodeURIComponent(contentAnimeId!)}&title=${encodeURIComponent(info.name)}&poster=${encodeURIComponent(info.poster)}`)}
                    className="group flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--isshoni-accent))] text-black ring-1 ring-inset ring-white/25 shadow-[0_10px_30px_-8px_hsl(var(--isshoni-accent)/0.6)] transition-all hover:scale-105 hover:bg-[hsl(var(--isshoni-accent)/0.9)] hover:shadow-[0_0_28px_hsl(var(--isshoni-accent)/0.5)] active:scale-95"
                    title="Watch Together"
                    aria-label="Start a Watch Together party"
                  >
                    <Users className="w-5 h-5 transition-transform group-hover:scale-110" />
                  </button>

                  {(isMobileNative || isDesktopApp) && (
                    <button
                      onClick={() => setIsDownloadModalOpen(true)}
                      className="h-14 w-14 rounded-full bg-primary/20 hover:bg-primary/30 text-primary flex items-center justify-center transition-all hover:scale-105"
                      title="Download Season"
                    >
                      <Download className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </main>
        </VideoBackground>

        <main
          className={cn(
            "relative z-10 pr-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32",
          )}
        >
          {/* Next Episode Schedule - for airing anime */}
          {nextEpisodeSchedule?.airingISOTimestamp && (
            <NextEpisodeSchedule
              animeId={contentAnimeId!}
              animeName={info.name}
              animePoster={info.poster}
              anilistId={Number(anilistId || moreInfo.anilistId) || null}
              airingTime={nextEpisodeSchedule.airingISOTimestamp}
              nextEpisodeNumber={nextEpisodeSchedule.episode || (info.stats.episodes.sub || info.stats.episodes.dub || 0) + 1}
              dayOfWeek={nextEpisodeSchedule.dayOfWeek}
              episodeTitle={nextEpisodeSchedule.title}
              overview={nextEpisodeSchedule.overview}
              thumbnail={nextEpisodeSchedule.image}
            />
          )}

          {/* Episodes */}
          <section className="mb-16">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">Episodes</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {isFilteringEpisodes
                      ? `${matchedEpisodes} of ${totalEpisodes}`
                      : `${totalEpisodes} total`}
                  </span>

                  {showEpisodeToolbar && (
                    <>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="search"
                          value={episodeQuery}
                          onChange={(event) => setEpisodeQuery(event.target.value)}
                          placeholder="Search number or title..."
                          aria-label="Search episodes"
                          className="h-9 w-48 md:w-60 pl-8 pr-3 rounded-full bg-muted/50 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex items-center rounded-full border border-border overflow-hidden">
                        <button
                          onClick={() => setEpisodeLayout("grid")}
                          aria-label="Thumbnail view"
                          aria-pressed={episodeLayout === "grid"}
                          className={cn(
                            "px-3 h-9 transition-colors",
                            episodeLayout === "grid"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEpisodeLayout("compact")}
                          aria-label="Compact view"
                          aria-pressed={episodeLayout === "compact"}
                          className={cn(
                            "px-3 h-9 transition-colors",
                            episodeLayout === "compact"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {hasEpisodeGroups && (
                <div className="flex flex-wrap gap-2">
                  {episodeGroups.map((group, index) => {
                    // Labelled by the episode numbers actually in the group rather
                    // than by slice arithmetic — with a search active the groups no
                    // longer line up with 1-24, 25-48, …
                    const start = group[0]?.number ?? index * EPISODES_PER_GROUP + 1;
                    const end = group[group.length - 1]?.number ?? start;
                    const isActive = index === activeEpisodeGroup;

                    return (
                      <button
                        key={`${start}-${end}-${index}`}
                        onClick={() => setSelectedEpisodeGroup(index)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all border ${isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {start}-{end}
                      </button>
                    );
                  })}
                </div>
              )}
              {hasEpisodeGroups && (
                <p className="text-xs text-muted-foreground">
                  Showing {visibleEpisodes.length} of {matchedEpisodes}
                  {isFilteringEpisodes ? ` matching episodes` : ` episodes`}
                </p>
              )}
            </div>
            {loadingEpisodes ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !episodesData ? null : visibleEpisodes.length === 0 ? (
              <GlassPanel className="p-6 text-center text-sm text-muted-foreground">
                No episode matches "{episodeQuery.trim()}".
              </GlassPanel>
            ) : episodeLayout === "grid" ? (
              /* Thumbnail cards. The screencap, air date, runtime and synopsis all
                 come from ani.zip, which is also what decides the numbering here. */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleEpisodes.map((ep, index) => (
                  <ContextMenu key={`${ep.episodeId}-${index}`}>
                    <ContextMenuTrigger>
                      <button
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        title={ep.title}
                        className={cn(
                          "group w-full text-left rounded-xl overflow-hidden border bg-muted/30 transition-all hover:border-primary/60 hover:bg-muted/60",
                          ep.isFiller
                            ? "border-orange/40"
                            : ep.hasAired === false
                              ? "border-dashed border-white/15 opacity-70"
                              : "border-border"
                        )}
                      >
                        <div className="relative aspect-video bg-muted/60 overflow-hidden">
                          {ep.image ? (
                            <img
                              src={ep.image}
                              alt={ep.title}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              onError={(event) => {
                                event.currentTarget.style.visibility = "hidden";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Tv className="w-7 h-7 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-bold backdrop-blur-sm">
                            EP {ep.number}
                          </span>
                          {ep.isFiller && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-orange/90 text-black text-[10px] font-bold uppercase tracking-wide">
                              Filler
                            </span>
                          )}
                          {ep.hasAired === false && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-primary/90 text-primary-foreground text-[10px] font-bold uppercase tracking-wide">
                              Upcoming
                            </span>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="w-11 h-11 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                            </span>
                          </span>
                        </div>
                        <div className="p-3 space-y-1.5">
                          <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {ep.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {ep.airDate && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {ep.airDate}
                              </span>
                            )}
                            {ep.runtime ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {ep.runtime}m
                              </span>
                            ) : null}
                          </div>
                          {ep.overview && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                              {ep.overview}
                            </p>
                          )}
                        </div>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        className="gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        Play Episode
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {visibleEpisodes.map((ep, index) => (
                  <ContextMenu key={`${ep.episodeId}-${index}`}>
                    <ContextMenuTrigger>
                      <HoverCard openDelay={220} closeDelay={80}>
                        <HoverCardTrigger asChild>
                          <button
                            onClick={() => handleEpisodeClick(ep.episodeId)}
                            className={`h-12 w-full rounded-lg font-medium transition-all hover:scale-105 relative ${ep.isFiller
                              ? "bg-orange/20 text-orange hover:bg-orange/30"
                              : ep.hasAired === false
                                // Dated in the future: still listed (ani.zip knows
                                // about it) but visibly not playable yet.
                                ? "bg-muted/40 text-muted-foreground border border-dashed border-white/15 hover:bg-muted/60"
                                : "bg-muted hover:bg-primary hover:text-primary-foreground"
                              }`}
                            title={ep.title}
                          >
                            {ep.number}
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent side="top" className="w-72 p-0 overflow-hidden">
                          {ep.image && (
                            <img
                              src={ep.image}
                              alt={ep.title}
                              loading="lazy"
                              className="w-full aspect-video object-cover"
                              onError={(event) => { event.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <div className="p-3 space-y-1.5">
                            <p className="text-sm font-semibold leading-snug">
                              {ep.number}. {ep.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {ep.airDate && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {ep.airDate}
                                </span>
                              )}
                              {ep.runtime ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {ep.runtime}m
                                </span>
                              ) : null}
                              {ep.hasAired === false && (
                                <span className="text-primary font-medium">Not yet aired</span>
                              )}
                              {ep.isFiller && <span className="text-orange font-medium">Filler</span>}
                            </div>
                            {ep.overview && (
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5 pt-1">
                                {ep.overview}
                              </p>
                            )}
                            {/* The native title is the one worth showing beside the
                                English one; the other ~12 languages would just be noise. */}
                            {ep.titles?.ja && ep.titles.ja !== ep.title && (
                              <p className="text-xs text-muted-foreground/80 pt-1">{ep.titles.ja}</p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {/* Download Episode removed from context menu */}
                      <ContextMenuItem
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        className="gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        Play Episode
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            )}
          </section>

          {/* Watch Order / Seasons Section */}
          {allSeasons.length > 1 && (
            <section className="mb-16">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-1.5 h-5 md:h-6 rounded-full bg-primary" />
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Watch Order
                </h2>
              </div>

              <div className="relative group/rail">
                {/* Left Carousel Button */}
                <button
                  type="button"
                  onClick={() => {
                    watchOrderScrollRef.current?.scrollBy({ left: -450, behavior: 'smooth' });
                  }}
                  aria-label="Scroll left"
                  className="absolute -left-3 top-1/2 -translate-y-8 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white border border-white/10 flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all shadow-xl backdrop-blur-md"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Cards Rail */}
                <div
                  ref={watchOrderScrollRef}
                  className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
                >
                  {allSeasons.map((season) => (
                    <Link
                      key={season.id}
                      to={`/anime/${season.id}`}
                      className={cn(
                        "group flex-shrink-0 w-60 sm:w-64 md:w-72 block transition-transform",
                        season.isCurrent && "pointer-events-none"
                      )}
                    >
                      <div className={cn(
                        "relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-muted/40 transition-all duration-300",
                        season.isCurrent
                          ? "ring-2 ring-white ring-offset-2 ring-offset-background"
                          : "hover:scale-[1.03] hover:ring-2 hover:ring-white/40"
                      )}>
                        <img
                          src={getProxiedImageUrl(season.poster)}
                          alt={season.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        {/* Dark gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

                        {/* Classification / Status badge — top-left */}
                        <div className="absolute top-2.5 left-2.5">
                          {season.isCurrent ? (
                            <span className="px-2.5 py-1 rounded-md bg-white text-black text-[11px] font-black uppercase tracking-wider shadow-md">
                              CURRENT
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-black/80 text-white text-[11px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/10 shadow-md">
                              {season.classification || `SEASON ${season.seasonNumber}`}
                            </span>
                          )}
                        </div>

                        {/* Episode count badge — bottom-right */}
                        {season.episodeCount && (
                          <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/10 shadow-md">
                            {season.episodeCount} EPS
                          </div>
                        )}
                      </div>

                      {/* Title & Metadata below card */}
                      <div className="mt-2.5 px-1">
                        <h4
                          className={cn(
                            "text-sm font-semibold truncate transition-colors",
                            season.isCurrent ? "text-primary" : "text-foreground group-hover:text-primary"
                          )}
                          title={season.name}
                        >
                          {season.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-medium">
                          <span>{season.format || 'TV'}</span>
                          {season.year && (
                            <>
                              <span>·</span>
                              <span>{season.year}</span>
                            </>
                          )}
                          {season.rating && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-amber-400">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                                <span>{season.rating}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Right Carousel Button */}
                <button
                  type="button"
                  onClick={() => {
                    watchOrderScrollRef.current?.scrollBy({ left: 450, behavior: 'smooth' });
                  }}
                  aria-label="Scroll right"
                  className="absolute -right-3 top-1/2 -translate-y-8 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white border border-white/10 flex items-center justify-center opacity-85 group-hover/rail:opacity-100 transition-all shadow-xl backdrop-blur-md"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </section>
          )}


          {/* Official streaming episode previews (AniList streamingEpisodes) */}
          {Array.isArray(moreInfo.streamingEpisodes) && moreInfo.streamingEpisodes.length > 0 && (
            <section className="mb-16">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-1.5 h-5 md:h-6 rounded-full bg-primary" />
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Official Streams
                </h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
                {moreInfo.streamingEpisodes
                  .filter((ep) => ep.url)
                  .slice(0, 24)
                  .map((ep, index) => (
                    <a
                      key={`${ep.url}-${index}`}
                      href={ep.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={ep.title || ep.site || 'Watch'}
                      className="group flex-shrink-0 w-44 rounded-xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors"
                    >
                      {ep.thumbnail ? (
                        <div className="relative aspect-video overflow-hidden">
                          <img
                            src={ep.thumbnail}
                            alt={ep.title || ''}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                            <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 fill-white transition-opacity" />
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-video flex items-center justify-center bg-muted">
                          <Play className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="text-xs font-medium line-clamp-2">{ep.title || 'Episode'}</p>
                        {ep.site && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <ExternalLinkIcon className="w-3 h-3" />
                            {ep.site}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
              </div>
            </section>
          )}

          {/* Relation Tree */}
          {moreInfo.relations && moreInfo.relations.length > 0 && (
            <section className="mb-16">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-1.5 h-5 md:h-6 rounded-full bg-primary" />
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Series Tree
                </h2>
              </div>
              <RelationTree relations={moreInfo.relations} />
            </section>
          )}

          {/* Characters */}
          {info.characterVoiceActor && info.characterVoiceActor.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Characters
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {info.characterVoiceActor.slice(0, 12).map((cva, index) => (
                  <GlassPanel 
                    key={`${cva.character.id}-${index}`} 
                    className="p-3 flex items-center gap-3 hover:bg-white/10 transition-all cursor-pointer group"
                    onClick={() => navigate(`/character/${cva.character.id}?name=${encodeURIComponent(cva.character.name)}`)}
                  >
                    <img 
                      src={getProxiedImageUrl(cva.character.poster) || "/placeholder.svg"} 
                      alt={cva.character.name}
                      className="w-14 h-14 rounded-full object-cover border border-white/10 group-hover:scale-110 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{cva.character.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cva.character.cast || "Character"}</p>
                    </div>
                    {cva.voiceActor.name !== "Unknown" && (
                       <div className="text-right border-l border-white/10 pl-3 hidden sm:block">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Voice</p>
                          <p className="text-[11px] font-medium truncate max-w-[80px]">{cva.voiceActor.name}</p>
                       </div>
                    )}
                  </GlassPanel>
                ))}
              </div>
            </section>
          )}

          {/* Staff */}
          {moreInfo.staff && moreInfo.staff.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-primary" />
                Staff
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {moreInfo.staff.map((s, index) => (
                  <GlassPanel key={`${s.id}-${index}`} className="p-3 flex items-center gap-3 hover:bg-white/10 transition-colors">
                    <img 
                      src={getProxiedImageUrl(s.imageUrl) || "/placeholder.svg"} 
                      alt={s.name}
                      className="w-10 h-10 rounded-full object-cover border border-white/10"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate">{s.name}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.role || "Staff"}</p>
                    </div>
                  </GlassPanel>
                ))}
              </div>
            </section>
          )}

          {/* Ratings Section */}
          <section className="mb-16">
            <RatingsSection animeId={contentAnimeId!} />
          </section>

          {/* Comments Section */}
          <section className="mb-16">
            <EpisodeComments
              animeId={contentAnimeId!}
              animeName={info.name}
              fallbackEpisodeId={episodesData?.episodes?.[0]?.episodeId}
            />
          </section>

          {/* Community posts about this anime */}
          {contentAnimeId && (
            <AnimeCommunityPosts
              animeId={contentAnimeId}
              animeName={info.name}
              animePoster={info.poster}
            />
          )}

          {/* Producer Catalog */}
          {producerAnimes.length > 0 && (
            <AnimeGrid
              animes={producerAnimes}
              title={`More from ${producerAnimeData?.producerName || producerNames[0] || 'this producer'}`}
            />
          )}

          {/* Related Anime */}
          {relatedAnime.length > 0 && (
            <AnimeGrid animes={relatedAnime.slice(0, 6)} title="Related Anime" />
          )}

          {/* Related Manga */}
          {relatedManga.length > 0 && (
            <AnimeGrid animes={relatedManga.slice(0, 6)} title="Related Manga" />
          )}

          {/* Recommended */}
          {recommendedAnimes.length > 0 && (
            <AnimeGrid animes={recommendedAnimes} title="Recommended" icon={<Sparkles className="w-5 h-5 text-primary" />} />
          )}

        </main>

        {!showSidebar && <MobileNav />}

        {(isMobileNative || isDesktopApp) && episodesData && (
          <SeasonDownloadModal
            isOpen={isDownloadModalOpen}
            onClose={() => setIsDownloadModalOpen(false)}
            episodes={episodesData.episodes}
            animeName={info.name}
            posterUrl={info.poster}
            animeId={contentAnimeId}
            anilistId={anilistId ? Number(anilistId) || null : null}
            malId={malId ? Number(malId) || null : null}
          />
        )}
      </div>
    </>
  );
}


